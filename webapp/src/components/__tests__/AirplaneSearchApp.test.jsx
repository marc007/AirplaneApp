import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AirplaneSearchApp from '../AirplaneSearchApp';
import { DataService, AIRPLANE_CACHE_KEY } from '../../services/dataService';
import { createMemoryStorage } from '../../storage/memoryStorage';
import { fetchAirplanes } from '../../services/parseClient';

jest.mock('../../services/parseClient');

const buildApp = (options = {}) => {
  const storage = options.storage ?? createMemoryStorage();
  const dataService = new DataService(storage);
  const user = userEvent.setup();

  return {
    storage,
    dataService,
    user,
    ...render(<AirplaneSearchApp dataService={dataService} />)
  };
};

describe('AirplaneSearchApp', () => {
  beforeEach(() => {
    fetchAirplanes.mockReset();
  });

  it('performs a search, renders results, and displays detail content', async () => {
    fetchAirplanes.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          tailNumber: 'N12345',
          manufacturer: 'Cessna',
          model: '172',
          statusCode: 'ACTIVE',
          expirationDate: '2024-12-31',
          owners: [
            {
              name: 'Jane Doe',
              city: 'Seattle',
              state: 'WA',
              country: 'US'
            }
          ]
        },
        {
          id: 2,
          tailNumber: 'N67890',
          manufacturer: 'Piper',
          model: 'PA-28',
          statusCode: 'INACTIVE'
        }
      ],
      meta: {
        total: 2,
        page: 1,
        pageSize: 2,
        totalPages: 1
      },
      filters: {
        tailNumber: {
          value: 'N12345',
          exact: true
        }
      }
    });

    const { user } = buildApp();

    await user.type(screen.getByLabelText(/tail number/i), '12345');
    await user.click(screen.getByTestId('search-button'));

    const list = await screen.findByRole('list', { name: /search results/i });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);

    await user.click(within(items[0]).getByRole('button'));

    const detail = await screen.findByRole('region', { name: /airplane detail/i });
    expect(within(detail).getByText(/Cessna/)).toBeInTheDocument();
    expect(within(detail).getByText(/Primary owner/i)).toBeInTheDocument();
    expect(within(detail).getByText(/Jane Doe/)).toBeInTheDocument();
    expect(fetchAirplanes).toHaveBeenCalledWith('N12345');
  });

  it('refreshes from cache without calling Parse again', async () => {
    const storage = createMemoryStorage();
    const { user } = buildApp({ storage });

    fetchAirplanes.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          tailNumber: 'N13579',
          manufacturer: 'Diamond',
          model: 'DA40',
          statusCode: 'ACTIVE'
        }
      ],
      meta: null,
      filters: null
    });

    await user.type(screen.getByLabelText(/tail number/i), '13579');
    await user.click(screen.getByTestId('search-button'));

    await screen.findByText(/N13579/);
    expect(fetchAirplanes).toHaveBeenCalledTimes(1);

    const cached = JSON.parse(storage.getItem(AIRPLANE_CACHE_KEY));
    cached.push({ id: 2, nnumber: 'N24680', manufacturer: 'Mooney', model: 'M20J', status: 'Active' });
    storage.setItem(AIRPLANE_CACHE_KEY, JSON.stringify(cached));

    await user.click(screen.getByTestId('refresh-button'));

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(screen.getByText(/N24680/)).toBeInTheDocument();
    expect(fetchAirplanes).toHaveBeenCalledTimes(1);
  });

  it('shows an error message when search fails', async () => {
    fetchAirplanes.mockRejectedValueOnce(new Error('network unavailable'));

    const { user } = buildApp();

    await user.type(screen.getByLabelText(/tail number/i), '155');
    await user.click(screen.getByTestId('search-button'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/network unavailable/i);
  });
});

import { createApp } from './app';
import { getConfig } from './config';

const config = getConfig();
const app = createApp();

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${config.port}`);
});

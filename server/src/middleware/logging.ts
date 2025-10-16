import morgan from 'morgan';

export const loggingMiddleware = morgan(':method :url :status :res[content-length] - :response-time ms');

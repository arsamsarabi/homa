// Prints the OpenAPI document; packages/api-client generates its types from it.
import { createApi } from './app';
import { openApiConfig } from './openapi';

process.stdout.write(`${JSON.stringify(createApi().getOpenAPI31Document(openApiConfig), null, 2)}\n`);

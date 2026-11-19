// Prints the OpenAPI document; packages/api-client generates its types from it.
import { createApi, openApiConfig } from './app';

console.log(JSON.stringify(createApi().getOpenAPI31Document(openApiConfig), null, 2));

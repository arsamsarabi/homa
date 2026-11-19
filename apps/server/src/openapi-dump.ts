// Prints the OpenAPI document; packages/api-client generates its types from it.
import { api, openApiConfig } from './app';

console.log(JSON.stringify(api.getOpenAPI31Document(openApiConfig), null, 2));

import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { serverAppConfig } from './app/app.config.server';

export default (context?: { platformRef?: unknown }) =>
  bootstrapApplication(App, serverAppConfig, context as never);

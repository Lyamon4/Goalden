import type { ExtensionMessage } from './types';

export async function sendMessage<T>(message: ExtensionMessage): Promise<T> {
  const response = await chrome.runtime.sendMessage(message);
  if (response?.error) {
    throw new Error(response.error);
  }
  return response as T;
}

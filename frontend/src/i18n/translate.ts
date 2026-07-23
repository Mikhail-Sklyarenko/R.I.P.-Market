import type { TranslateParams } from './types.ts';

type MessageTree = {
  [key: string]: string | MessageTree;
};

export function getMessageByPath(
  tree: MessageTree,
  path: string,
): string | undefined {
  const parts = path.split('.');
  let current: string | MessageTree | undefined = tree;
  for (const part of parts) {
    if (current == null || typeof current === 'string') {
      return undefined;
    }
    current = current[part];
  }
  return typeof current === 'string' ? current : undefined;
}

export function interpolate(
  template: string,
  params?: TranslateParams,
): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function translate(
  tree: MessageTree,
  key: string,
  params?: TranslateParams,
): string {
  const template = getMessageByPath(tree, key);
  if (template === undefined) {
    return key;
  }
  return interpolate(template, params);
}

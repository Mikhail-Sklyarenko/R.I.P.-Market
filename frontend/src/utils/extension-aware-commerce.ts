/**
 * I1: Extension-aware buy/sell web UX — shared hint resolution for
 * purchase cards, inventory sell, and deal-flow copy variants.
 * Never blocks purchase; soft trust / connect guidance only.
 */

export type ExtensionAwareSurface = 'buy' | 'sell';

export type ExtensionAwareHintKind =
  | 'hidden'
  | 'connected'
  | 'pair'
  | 'install';

export type ExtensionAwareHint = {
  kind: ExtensionAwareHintKind;
  titleKey: string;
  bodyKey: string;
  /** Show compact ExtensionConnectPanel under the hint. */
  showConnectPanel: boolean;
};

/**
 * Resolve the soft extension strip for buy/sell entry surfaces.
 */
export function resolveExtensionAwareHint(params: {
  channelEnabled: boolean;
  runtimeAvailable: boolean;
  connected: boolean;
  surface: ExtensionAwareSurface;
}): ExtensionAwareHint {
  if (!params.channelEnabled) {
    return {
      kind: 'hidden',
      titleKey: '',
      bodyKey: '',
      showConnectPanel: false,
    };
  }

  const ns =
    params.surface === 'buy'
      ? 'extensionAwareBuy'
      : 'extensionAwareSell';

  if (params.connected) {
    return {
      kind: 'connected',
      titleKey: `${ns}.connectedTitle`,
      bodyKey: `${ns}.connectedBody`,
      showConnectPanel: false,
    };
  }

  if (!params.runtimeAvailable) {
    return {
      kind: 'install',
      titleKey: `${ns}.installTitle`,
      bodyKey: `${ns}.installBody`,
      showConnectPanel: false,
    };
  }

  return {
    kind: 'pair',
    titleKey: `${ns}.pairTitle`,
    bodyKey: `${ns}.pairBody`,
    showConnectPanel: true,
  };
}

export type ExtensionAwareNextActionOptions = {
  extensionConnected?: boolean | null;
  extensionTradeAckEnabled?: boolean;
  extensionTaskPipeline?: boolean;
};

/**
 * Whether buyer accept next-action should mention the shield / pair prompt.
 */
export function resolveBuyerAcceptExtensionCopyKind(
  options: ExtensionAwareNextActionOptions | undefined,
): 'shield' | 'pair' | 'default' {
  if (!options?.extensionTradeAckEnabled) {
    return 'default';
  }
  if (options.extensionConnected === true) {
    return 'shield';
  }
  if (options.extensionConnected === false) {
    return 'pair';
  }
  return 'default';
}

/**
 * Whether seller auto-send waiting copy should prompt reconnect.
 */
export function resolveSellerAutoSendExtensionCopyKind(
  options: ExtensionAwareNextActionOptions | undefined,
): 'offline' | 'default' {
  if (
    options?.extensionTaskPipeline &&
    options.extensionConnected === false
  ) {
    return 'offline';
  }
  return 'default';
}

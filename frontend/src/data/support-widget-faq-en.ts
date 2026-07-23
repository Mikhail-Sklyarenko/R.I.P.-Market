import type { SupportWidgetArticle } from './support-widget-faq.ts';

/** English mirror of SUPPORT_WIDGET_ARTICLES — same ids for stable deep-links. */
export const SUPPORT_WIDGET_ARTICLES_EN: readonly SupportWidgetArticle[] = [
  {
    id: 'widget-withdraw-time',
    title: 'How long does a withdrawal take?',
    keywords: ['withdraw', 'usdt', 'time', 'wait'],
    body:
      'The request is processed after review. Usually a few minutes to a few hours. Check status in the "Withdraw" tab of your wallet.',
  },
  {
    id: 'widget-deposit-missing',
    title: "I deposited but the balance didn't update",
    keywords: ['deposit', 'usdt', 'balance'],
    body:
      'Check the TRC-20 network and minimum amount. Credit appears after TRON network confirmations — sometimes it takes 5–15 minutes.',
  },
  {
    id: 'widget-trade-stuck',
    title: 'Trade sent, status not changing',
    keywords: ['trade', 'status', 'deal'],
    body:
      'Accept the trade offer in Steam and wait 1–2 minutes. If the status still hasn\u2019t updated — open the deal on the site and check whether an offer ID is linked.',
  },
  {
    id: 'widget-trade-url',
    title: 'Where do I set my Trade URL?',
    keywords: ['trade url', 'link', 'trade'],
    body:
      'Account → "Trade URL" field. Click "Get Trade URL", copy the URL from Steam, and save it.',
  },
  {
    id: 'widget-extension-error',
    title: "Extension isn't sending the trade",
    keywords: ['extension', 'error', 'steam'],
    body:
      'Sign in to Steam as the seller in the same Chrome profile, reconnect the extension in your account, and refresh the deal page.',
  },
  {
    id: 'widget-cancel-trade',
    title: 'Can I cancel a deal?',
    keywords: ['cancel', 'dispute'],
    body:
      'The buyer can cancel before the trade offer is sent. After the offer is sent — only through a dispute or support, include the deal ID.',
  },
];

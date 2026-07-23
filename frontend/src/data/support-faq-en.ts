import type { SupportFaqCategory } from './support-faq.ts';

/** English FAQ — same article/category ids as RU for stable deep-links. */
export const SUPPORT_FAQ_CATEGORIES_EN: readonly SupportFaqCategory[] = [
  {
    id: 'general',
    title: 'General',
    articles: [
      {
        id: 'what-is-rip',
        category: 'general',
        title: 'What is R.I.P. Market?',
        keywords: ['marketplace', 'p2p', 'cs2', 'skins'],
        body:
          'R.I.P. Market is a P2P marketplace for CS2 skin trades. The buyer reserves funds in the wallet, the seller sends a Steam trade offer, and the deal completes after the item transfer is confirmed.\n\n' +
          'We do not hold items on bots: trades go directly between Steam accounts. The marketplace fee is charged on successful deals.',
      },
      {
        id: 'supported-games',
        category: 'general',
        title: 'Which games are supported?',
        keywords: ['cs2', 'games', 'dota', 'rust'],
        body:
          'CS2 (Counter-Strike 2) is supported today. Inventory syncs from Steam, and deals use standard Steam trade offers.',
      },
      {
        id: 'extension',
        category: 'general',
        title: 'Browser extension',
        keywords: ['extension', 'chrome', 'trade', 'automation'],
        body:
          'The R.I.P. Market extension helps sellers automate trade offers: it opens the Steam trade page, adds the item, and reports status back to the site.\n\n' +
          'Install it using the deal-page instructions, connect it in Account, and stay signed into the seller Steam account in the same Chrome browser.',
      },
      {
        id: 'trade-url',
        category: 'general',
        title: 'Trade URL is required',
        keywords: ['trade url', 'steam', 'offer'],
        body:
          'A Trade URL is required for all P2P trades. Without it you cannot buy a skin or list an item for sale.\n\n' +
          'In Account, open “Get link” to Steam settings. Copy the URL from “Who can send me trade offers?” and paste it into your R.I.P. Market profile.',
      },
    ],
  },
  {
    id: 'security',
    title: 'Security',
    articles: [
      {
        id: 'trade-hold',
        category: 'security',
        title: 'Steam trade hold',
        keywords: ['trade hold', 'steam', 'lock', '7 days'],
        body:
          'Steam may temporarily restrict trades on a new device, after a password change, or on a fresh account. This is a Steam restriction — we cannot remove it.\n\n' +
          'Make sure the item is tradable, your Trade URL is set, and the correct Steam account is open in the browser. During a trade hold, send the offer manually or wait until it lifts.',
      },
      {
        id: 'vac-ban',
        category: 'security',
        title: 'VAC ban',
        keywords: ['vac', 'ban', 'blocked'],
        body:
          'CS2 accounts with a VAC ban cannot buy or sell on the marketplace. This protects P2P trading.\n\n' +
          'If the ban was lifted in Steam but access did not return, contact support with your Steam ID.',
      },
      {
        id: 'settlement-hold',
        category: 'security',
        title: 'Funds held up to 8 days',
        keywords: ['hold', 'settlement', 'payout', '8 days'],
        body:
          'After a confirmed trade, the seller payout may stay on hold for up to 8 days. This protects against Steam trade reversals.\n\n' +
          'When the hold ends, funds move to available balance automatically. Hold status is visible in Wallet and on the deal page.',
      },
      {
        id: 'scam-protection',
        category: 'security',
        title: 'How to avoid scams',
        keywords: ['security', 'scam', 'fraud', 'check'],
        body:
          'Before accepting a trade offer, verify the item name, wear, and float. Do not accept extras from the seller.\n\n' +
          'R.I.P. Market never asks for your Steam password or Steam Guard codes. Trades only go through the official Steam client.',
      },
    ],
  },
  {
    id: 'deposit',
    title: 'Deposits',
    articles: [
      {
        id: 'wallet-deposit',
        category: 'deposit',
        title: 'How to deposit USDT',
        keywords: ['wallet', 'usdt', 'deposit', 'balance', 'trc-20'],
        body:
          'Open Wallet → Deposit. Copy the TRC-20 address or scan the QR code. Send USDT only on the TRON (TRC-20) network.\n\n' +
          'Minimum amount and warnings are shown on the page. Credit usually appears in 5–15 minutes after network confirmations. Rate: 1 USDT = 1 USD on the marketplace balance.',
      },
      {
        id: 'wallet-hold',
        category: 'deposit',
        title: 'What is hold on purchase',
        keywords: ['hold', 'reserve', 'balance', 'buy'],
        body:
          'When you buy, the deal amount moves from Available to Hold. Funds are reserved for the seller but not yet released — this protects the buyer.\n\n' +
          'After a successful trade, hold is settled to the seller. On cancel, timeout, or failed deal, funds return to available balance.',
      },
      {
        id: 'wrong-network',
        category: 'deposit',
        title: 'I sent USDT on the wrong network',
        keywords: ['network', 'erc-20', 'bep-20', 'deposit error'],
        body:
          'We only accept USDT TRC-20. Transfers on ERC-20, BEP-20, and other networks are not credited automatically and may be lost.\n\n' +
          'If this already happened, open a support ticket immediately with the transaction hash and sender address.',
      },
    ],
  },
  {
    id: 'buying',
    title: 'Buying',
    articles: [
      {
        id: 'buying',
        category: 'buying',
        title: 'How to buy a skin',
        keywords: ['buy', 'catalog', 'checkout', 'payment'],
        body:
          '1. Pick a skin in the catalog and open the listing.\n' +
          '2. Press Buy — funds are reserved in your wallet.\n' +
          '3. Wait for the seller’s trade offer.\n' +
          '4. Accept the Steam trade after checking the item.\n' +
          '5. Deal status updates automatically after the transfer is confirmed.',
      },
      {
        id: 'buyer-checklist',
        category: 'buying',
        title: 'What to check before accepting a trade',
        keywords: ['check', 'buyer', 'wear', 'float'],
        body:
          'Match the market hash name, wear, and float to the listing. Make sure the seller sends only the expected item.\n\n' +
          'With the R.I.P. Market extension installed, the Steam trade offer page shows a deal verification panel.',
      },
      {
        id: 'dispute',
        category: 'buying',
        title: 'Deal dispute',
        keywords: ['dispute', 'problem', 'missing', 'refund'],
        body:
          'If the trade failed, the item does not match, or an error occurred — open the deal under My deals. On timeout the status may move to dispute.\n\n' +
          'Create a support ticket with the deal ID, trade offer screenshots, and a short description.',
      },
    ],
  },
  {
    id: 'selling',
    title: 'Selling',
    articles: [
      {
        id: 'selling',
        category: 'selling',
        title: 'How to sell a skin',
        keywords: ['sell', 'listing', 'inventory'],
        body:
          '1. Link Steam and set your Trade URL.\n' +
          '2. Open Sell and sync your inventory.\n' +
          '3. Select an item and set a price.\n' +
          '4. After a purchase, send the buyer a trade offer (manually or via the extension).\n' +
          '5. Receive payout to your wallet minus the 5% fee.',
      },
      {
        id: 'extension-errors',
        category: 'selling',
        title: 'Extension and trade errors',
        keywords: ['extension', 'item_missing', 'trade hold', 'session_revoked'],
        body:
          'ITEM_MISSING — sync inventory on the site and make sure the item was not sold in Steam.\n\n' +
          'TRADE_HOLD_BLOCKED — Steam restriction; send the offer manually.\n\n' +
          'SESSION_REVOKED — reconnect the extension in Account.\n\n' +
          'STEAM_ACCOUNT_MISMATCH — sign into Steam as the seller in the same Chrome profile.',
      },
      {
        id: 'pricing',
        category: 'selling',
        title: 'How to set a price',
        keywords: ['price', 'fee', 'steam', 'market'],
        body:
          'The catalog shows Steam and marketplace prices — use them as a guide when listing. The marketplace fee is 5%; estimated payout is shown when you create a listing.\n\n' +
          'Prices are in USD/USDT. You can change the price or remove an active listing from Inventory or My listings.',
      },
    ],
  },
  {
    id: 'withdrawal',
    title: 'Withdrawals',
    articles: [
      {
        id: 'wallet-withdraw',
        category: 'withdrawal',
        title: 'How to withdraw USDT',
        keywords: ['withdraw', 'usdt', 'trc-20', 'wallet'],
        body:
          'Open Wallet → Withdraw. Enter a TRC-20 address and amount. Funds are taken from available balance.\n\n' +
          'Check the fee and minimum amount in the form. Request status is in the withdrawal history on the same tab.',
      },
      {
        id: 'withdraw-timing',
        category: 'withdrawal',
        title: 'Withdrawal timing',
        keywords: ['time', 'processing', 'withdraw'],
        body:
          'Requests go through automated and manual checks. Processing usually takes from a few minutes to a few hours.\n\n' +
          'Funds on hold, in active deals, or under settlement hold cannot be withdrawn until those operations finish.',
      },
      {
        id: 'wallet',
        category: 'withdrawal',
        title: 'Balance and fees',
        keywords: ['wallet', 'fee', 'balance', 'payout'],
        body:
          'Available — spend or withdraw. Hold — reserved in deals. Frozen — temporarily unavailable by marketplace decision.\n\n' +
          'The withdrawal fee is shown before confirmation. The “you receive” amount is calculated automatically.',
      },
    ],
  },
  {
    id: 'extras',
    title: 'More features',
    articles: [
      {
        id: 'notifications',
        category: 'extras',
        title: 'Notifications',
        keywords: ['notifications', 'deals', 'wallet'],
        body:
          'Deal and wallet events appear in the bottom-right corner. Click a notification to open the order or balance.\n\n' +
          'The full list is under Notifications in the user menu.',
      },
      {
        id: 'support-ticket',
        category: 'extras',
        title: 'Contact support',
        keywords: ['support', 'ticket', 'help'],
        body:
          'If FAQ does not answer your question, create a ticket under Support. Include the deal ID, describe the issue, and attach screenshots.\n\n' +
          'For urgent cases you can also email support — the address is on the tickets page.',
      },
    ],
  },
];

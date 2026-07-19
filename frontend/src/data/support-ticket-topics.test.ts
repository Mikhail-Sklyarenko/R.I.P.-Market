import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SUPPORT_TICKET_TOPICS,
  isSupportTicketTopicLabel,
} from './support-ticket-topics.ts';

describe('support ticket topics', () => {
  it('exposes a non-empty topic list with unique labels', () => {
    assert.ok(SUPPORT_TICKET_TOPICS.length >= 5);
    const labels = SUPPORT_TICKET_TOPICS.map((topic) => topic.label);
    assert.equal(new Set(labels).size, labels.length);
  });

  it('validates topic labels', () => {
    assert.equal(isSupportTicketTopicLabel(SUPPORT_TICKET_TOPICS[0]!.label), true);
    assert.equal(isSupportTicketTopicLabel('Произвольная тема'), false);
  });
});

import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { answerOf, decide, registerApprovalCategory, type Answer } from '@/lib/baarali-approvals';
import { useConnection } from '@/lib/connection';

// BAARALI(07/11/2026): what a tap on the agent's notification does
// (docs/baarali/AGENT_TELEPHONE_SPEC.md §3 C). « Approve » or « Deny »
// answers the waiting action, then opens its chat so the person sees the
// agent go on; any other tap opens where it leads. A tap that launched the
// app waits for the connection to the instance before it answers.
export function AgentResponder() {
  const { rpc, status } = useConnection();
  const [pending, setPending] = useState<Answer[]>([]);
  const handled = useRef(new Set<string>());

  useEffect(() => {
    void registerApprovalCategory().catch(() => {});
    const take = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (handled.current.has(id)) return;
      handled.current.add(id);
      const answer = answerOf(response.actionIdentifier, response.notification.request.content.data);
      if (answer.kind !== 'none') setPending((list) => [...list, answer]);
    };
    // The tap that opened the app, then every later one.
    void Notifications.getLastNotificationResponseAsync().then(take).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(take);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!pending.length || status !== 'connected' || !rpc) return;
    const [answer, ...rest] = pending;
    setPending(rest);
    void (async () => {
      if (answer.kind === 'decide') {
        const sent = await decide(rpc, answer.data, answer.decision);
        if (!sent) {
          Alert.alert('Your answer was not sent', 'The action may have been settled already. Open the chat to check.');
        }
        router.push({ pathname: '/chat', params: answer.data.sessionId ? { id: answer.data.sessionId } : {} });
      } else if (answer.kind === 'open') {
        router.push({ pathname: '/chat', params: answer.sessionId ? { id: answer.sessionId } : {} });
      }
    })();
  }, [pending, status, rpc]);

  return null;
}

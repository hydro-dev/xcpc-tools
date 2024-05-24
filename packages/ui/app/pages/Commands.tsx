import React from 'react';
import { notifications } from '@mantine/notifications';

export default function Commands() {
  const [command, setCommand] = React.useState('')

  const operation = async (op: string) => {
    try {
      const res = await (await fetch('/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: op }),
      })).json();
      if (res.error) {
        notifications.show({ title: 'Error', message: `${res.error.message}(${res.error.params})`, color: 'red' });
        return;
      }
      notifications.show({ title: 'Success', message: 'Balloon Updated', color: 'green' });
    } catch (e) {
      console.error(e);
      notifications.show({ title: 'Error', message: 'Failed to update balloon', color: 'red' });
    }
  }

  return (
    <div>
      <textarea rows={10} cols={100} style={{ fontFamily: 'monospace' }} value={command} onChange={(ev) => setCommand(ev.target.value)} />
      <button onClick={() => fetch('/commands', { method: 'POST', body: JSON.stringify({ command }) })}>Send</button>
      <button onClick={() => operation('reboot')}>Reboot All</button>
      <button onClick={() => operation('set_hostname')}>Update Hostname</button>
      <button onClick={() => operation('show_ids')}>Show IDS</button>
    </div >
  );
}

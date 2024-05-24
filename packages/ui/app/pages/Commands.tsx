import React from 'react';

export default function Commands() {
  const [command, setCommand] = React.useState('')

  const operation = (op: string) => fetch('/commands', { method: 'POST', body: JSON.stringify({ operation: op }) })

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

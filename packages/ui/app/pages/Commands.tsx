import React, { useState } from 'react';
import {
  Button, Card, Divider, Group, Textarea, Title, TextInput, NumberInput, ActionIcon, Stack, Switch, Text, Modal, Alert,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconLockOpen, IconLock, IconSend, IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';

export default function Commands() {
  const [command, setCommand] = React.useState('');
  const [advancedMode, setAdvancedMode] = useState(false);
  const [targetIP, setTargetIP] = useState('');
  const [targetPort, setTargetPort] = useState(65432);
  const [authKey, setAuthKey] = useState('BiGCIcPc');
  const [modalOpened, setModalOpened] = useState(false);
  const [modalOperation, setModalOperation] = useState('');
  const [windowsCommand, setWindowsCommand] = React.useState('');

  // 新增: 执行结果详情弹窗状态
  const [resultModalOpened, setResultModalOpened] = useState(false);
  const [resultDetails, setResultDetails] = useState({ success: 0, fail: 0, result: [], operation: '' });

  const operation = async (op: string, withCommand = false) => {
    try {
      const res = await (await fetch('commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: op, command: withCommand ? command : undefined }),
      })).json();
      if (res.error) {
        notifications.show({ title: 'Error', message: `${res.error.message}(${res.error.params})`, color: 'red' });
        return;
      }
      
      // 新增: 处理锁屏和解锁命令的结果
      if (op === 'lock_screens' || op === 'unlock_screens') {
        const failCount = res.fail || 0;
        
        // 保存详细结果供查看
        setResultDetails({
          success: res.success || 0,
          fail: failCount,
          result: res.result || [],
          operation: op === 'lock_screens' ? '锁屏' : '解锁'
        });
        
        // 根据成功/失败情况显示通知
        if (failCount > 0) {
          notifications.show({
            title: `${op === 'lock_screens' ? '锁屏' : '解锁'}操作部分失败`,
            message: `成功: ${res.success || 0}台, 失败: ${failCount}台. 点击可查看详情`,
            color: 'yellow',
            autoClose: false,
            onClick: () => setResultModalOpened(true)
          });
        } else {
          notifications.show({
            title: '操作成功',
            message: `已成功${op === 'lock_screens' ? '锁定' : '解锁'}${res.success || 0}台机器`,
            color: 'green'
          });
        }
      } else {
        notifications.show({ title: 'Success', message: 'Commands Submitted', color: 'green' });
      }
    } catch (e) {
      console.error(e);
      notifications.show({ 
        title: 'Error', 
        message: 'Failed to submit Commands', 
        color: 'red' 
      });
    }
  };

  // 发送直接TCP命令
  const sendDirectCommand = async (op: string) => {
    if (!targetIP) {
      notifications.show({
        title: '错误',
        message: '请输入目标IP地址',
        color: 'red',
      });
      return;
    }

    try {
      const res = await fetch('/api/direct-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: targetIP,
          port: targetPort,
          op: op.toUpperCase(),
          authKey: authKey
        }),
      });
      
      const data = await res.json();
      
      if (data.error) {
        notifications.show({
          title: '错误',
          message: data.error,
          color: 'red',
        });
      } else {
        notifications.show({
          title: '成功',
          message: `已成功发送${op === 'LOCK' ? '锁屏' : '解锁'}命令到 ${targetIP}:${targetPort}`,
          color: 'green',
        });
      }
    } catch (error) {
      console.error(error);
      notifications.show({
        title: '错误',
        message: '发送命令失败',
        color: 'red',
      });
    }
  };

  // 打开确认模态框
  const openConfirmModal = (op: string) => {
    setModalOperation(op);
    setModalOpened(true);
  };

  // 新增: 格式化错误消息，提取出更易读的信息
  const formatErrorMessage = (message: string) => {
    if (typeof message !== 'string') return '未知错误';
    
    // 提取连接被拒绝的错误
    if (message.includes('ECONNREFUSED')) {
      return '连接被拒绝，可能是锁屏服务未运行或端口未开放';
    }
    
    // 提取超时错误
    if (message.includes('timeout')) {
      return '连接超时，服务未响应';
    }
    
    // 提取网络不可达错误
    if (message.includes('ENETUNREACH')) {
      return '网络不可达，可能是IP地址错误或网络问题';
    }
    
    return message;
  };

  // 新增: 专属Windows批量命令执行函数
  const windowsOperation = async () => {
    if (!windowsCommand) {
      notifications.show({ title: 'Error', message: 'Windows命令不能为空', color: 'red' });
      return;
    }
    try {
      const res = await (await fetch('commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'winCommand', command: windowsCommand }),
      })).json();
      if (res.error) {
        notifications.show({ title: 'Error', message: `${res.error.message}`, color: 'red' });
      } else {
        const { success, fail } = res;
        if (fail > 0) {
          notifications.show({ title: 'Partial Failure', message: `成功: ${success}, 失败: ${fail}`, color: 'yellow' });
        } else {
          notifications.show({ title: 'Success', message: `Windows命令已发送, 成功: ${success}`, color: 'green' });
        }
      }
    } catch (e) {
      console.error(e);
      notifications.show({ title: 'Error', message: 'Windows批量命令发送失败', color: 'red' });
    }
  };

  return (
    <>
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Title order={3}>Send Commands to Monitoring Computer</Title>
        <Textarea
          label="Command"
          my="md"
          rows={10}
          cols={100}
          style={{ fontFamily: 'monospace' }}
          value={command}
          onChange={(ev) => setCommand(ev.target.value)}
        />
        <Group justify="center" my="md">
          <Button leftSection={<IconSend size={16} />} onClick={() => operation('command', true)}>Send</Button>
        </Group>
        <Divider my="md" />
        <Title order={3}>Quick Commands</Title>
        <Group my="md" justify="space-start">
          <Button onClick={() => operation('reboot')}>Reboot All</Button>
          <Button onClick={() => operation('set_hostname')}>Update Hostname</Button>
          <Button onClick={() => operation('show_ids')}>Show IDS</Button>
        </Group>
        <Divider my="md" />
        <Title order={3}>Windows Screen Control</Title>
        
        <Alert icon={<IconInfoCircle size="1rem" />} title="使用说明" color="blue" mb="md" withCloseButton={false}>
          确保选手机已运行锁屏服务程序并监听65432端口。如果部分机器未运行服务，执行后将显示详细的失败列表。
        </Alert>
        
        <Group my="md" justify="space-start">
          <Button onClick={() => openConfirmModal('lock_screens')} color="red" leftSection={<IconLock size={16} />}>
            一键锁屏 (Windows)
          </Button>
          <Button onClick={() => openConfirmModal('unlock_screens')} color="green" leftSection={<IconLockOpen size={16} />}>
            一键开屏 (Windows)
          </Button>
        </Group>

        <Divider my="md" label="高级选项" labelPosition="center" />
        
        <Group position="apart" mb="xs">
          <Text size="sm">启用高级模式</Text>
          <Switch 
            checked={advancedMode}
            onChange={(event) => setAdvancedMode(event.currentTarget.checked)}
          />
        </Group>

        {advancedMode && (
          <Card shadow="xs" p="md" withBorder>
            <Stack>
              <TextInput
                label="目标IP地址"
                placeholder="输入选手机IP地址"
                value={targetIP}
                onChange={(e) => setTargetIP(e.target.value)}
                required
              />
              <NumberInput
                label="目标端口"
                defaultValue={65432}
                value={targetPort}
                onChange={(value) => setTargetPort(Number(value))}
                min={1}
                max={65535}
              />
              <TextInput
                label="认证密钥"
                placeholder="输入认证密钥"
                value={authKey}
                onChange={(e) => setAuthKey(e.target.value)}
              />
              <Group>
                <Button 
                  color="red"
                  leftSection={<IconLock size={16} />}
                  onClick={() => sendDirectCommand('LOCK')}
                >
                  锁定指定主机
                </Button>
                <Button 
                  color="green"
                  leftSection={<IconLockOpen size={16} />}
                  onClick={() => sendDirectCommand('UNLOCK')}
                >
                  解锁指定主机
                </Button>
              </Group>
            </Stack>
          </Card>
        )}

        <Divider my="md" />
        <Title order={3}>Windows 批量执行命令</Title>
        <Textarea
          label="Windows Command"
          my="md"
          rows={4}
          cols={80}
          value={windowsCommand}
          onChange={(ev) => setWindowsCommand(ev.target.value)}
          placeholder="输入要在所有Windows选手机上执行的命令"
        />
        <Group justify="center" my="md">
          <Button color="blue" onClick={windowsOperation}>Send Windows Command</Button>
        </Group>
      </Card>

      {/* 确认操作模态框 */}
      <Modal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        title={modalOperation === 'lock_screens' ? '确认锁定所有选手机' : '确认解锁所有选手机'}
        centered
      >
        <Text mb="md">
          {modalOperation === 'lock_screens' 
            ? '您确定要锁定所有选手机屏幕吗？这将使所有选手暂时无法操作电脑。' 
            : '您确定要解锁所有选手机屏幕吗？这将使所有选手可以继续操作电脑。'}
        </Text>
        <Group position="right">
          <Button variant="outline" onClick={() => setModalOpened(false)}>取消</Button>
          <Button 
            color={modalOperation === 'lock_screens' ? 'red' : 'green'}
            onClick={() => {
              setModalOpened(false);
              operation(modalOperation);
            }}
          >
            确认
          </Button>
        </Group>
      </Modal>
      
      {/* 新增: 执行结果详情模态框 */}
      <Modal
        opened={resultModalOpened}
        onClose={() => setResultModalOpened(false)}
        title={`${resultDetails.operation}操作执行结果`}
        size="lg"
        centered
      >
        <Alert icon={<IconInfoCircle size="1rem" />} title="执行统计" color="blue" mb="md" withCloseButton={false}>
          成功: {resultDetails.success}台, 失败: {resultDetails.fail}台
        </Alert>
        
        {resultDetails.fail > 0 && (
          <Alert icon={<IconAlertTriangle size="1rem" />} title="失败的机器" color="red" mb="md" withCloseButton={false}>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {resultDetails.result.map((item, index) => {
                if (item instanceof Error || (typeof item === 'object' && item?.message)) {
                  // 这是失败的项目
                  return (
                    <div key={index} style={{ marginBottom: '8px', borderBottom: '1px solid #f2f2f2', paddingBottom: '4px' }}>
                      <strong>机器 {index+1}:</strong> {formatErrorMessage(item?.message || String(item))}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </Alert>
        )}
        
        <Group position="center">
          <Button onClick={() => setResultModalOpened(false)}>关闭</Button>
        </Group>
      </Modal>
    </>
  );
}

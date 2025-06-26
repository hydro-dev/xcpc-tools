import { Context } from 'cordis';
import { Handler } from '@hydrooj/framework';
import * as path from 'path';
import { fs } from '../utils';
import { config } from '../config';

class ScreenshotHandler extends Handler {
  // 接收客户端POST截图
  async post({ mac, screenshot }) {
    // 日志: 记录请求来源和mac、ip
    // 改为使用请求来源 IP
    const sourceIp = this.request.ip.replace('::ffff:', '');
    this.ctx.logger('screenshot').debug(`POST /screenshot from sourceIp=${sourceIp}, mac=${mac}`);
    if (!mac || !screenshot) {
      this.response.status = 400;
      return 'cleanup';
    }
    // 查找监控列表使用来源 IP
    const found = await this.ctx.db.monitor.findOne({ ip: sourceIp });
    this.ctx.logger('screenshot').debug(`Found monitor with ip=${sourceIp}: ${found}`);
    if (!found) {
      this.ctx.logger('screenshot').warn(`IP ${sourceIp} not found in monitor list`);
      this.response.status = 204;
      return 'cleanup';
    }
    
    // 使用项目根 data 目录保存截图
    try {
      const dir = path.resolve(process.cwd(), 'data', 'screenshot', sourceIp);
      fs.ensureDirSync(dir);
      const filename = `${Date.now()}.png`;
      const filepath = path.join(dir, filename);
      fs.writeFileSync(filepath, Buffer.from(screenshot, 'base64'));
      this.response.body = { status: 'ok' };
    } catch (err) {
      this.ctx.logger('screenshot').error('保存截图失败', err);
      this.response.status = 500;
      return 'cleanup';
    }
  }

  // GET获取最新截图
  async get({ ip }) {
    this.ctx.logger('screenshot').debug(`GET /screenshot?ip=${ip}`);
    if (!ip) {
      this.response.status = 400;
      this.response.body = { message: 'IP地址未提供' };
      return;
    }
    const dir = path.resolve(process.cwd(), 'data', 'screenshot', ip);
    if (!fs.existsSync(dir)) {
      this.response.status = 404;
      this.response.body = { message: '暂无截图反馈' };
      return;
    }
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
    if (!files.length) {
      this.response.status = 404;
      this.response.body = { message: '暂无截图反馈' };
      return;
    }
    const latest = files[files.length - 1];
    const buf = fs.readFileSync(path.join(dir, latest));
    this.response.body = {
      ip,
      timestamp: latest.replace(/\.png$/, ''),
      screenshot: buf.toString('base64'),
    };
  }
}

export async function apply(ctx: Context) {
  // 只需注册基础路由，前端使用相对路径自动带 secretRoute 前缀
  ctx.Route('screenshot', '/screenshot', ScreenshotHandler);
}

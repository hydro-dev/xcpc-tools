import 'cordis';
import type { BalloonDoc, BalloonNotificationSource, VoidReturn } from './interface';

declare module 'cordis' {
    interface Events {
        'app/started': () => void
        'app/ready': () => VoidReturn
        'app/exit': () => VoidReturn
        'notifier/balloonTask': (balloons: BalloonDoc[], source: BalloonNotificationSource) => VoidReturn
    }
}

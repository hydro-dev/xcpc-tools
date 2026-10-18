// Cordis event declarations live in a declaration file on purpose:
// @hydrooj/framework 0.2.6 augments `Events` with a type parameter (written
// against cordis 4.0.0-beta.5), which conflicts with the non-generic `Events`
// of cordis >= 4.0.0-rc at the declaration level. Keeping our augmentation in
// a .d.ts (plus skipLibCheck) keeps the event types visible to the compiler
// without surfacing that third-party conflict in every augmenting file.
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

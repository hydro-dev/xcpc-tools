import {
    Camera,
    Geometry,
    Mesh,
    Program,
    Renderer,
} from 'ogl';
import { useEffect, useRef } from 'react';

const PARTICLE_COUNT = 300;
const PARTICLE_SPREAD = 10;
const PARTICLE_SPEED = 0.035;

const vertexShader = /* glsl */ `
  attribute vec3 position;
  attribute vec4 random;

  uniform mat4 modelMatrix;
  uniform mat4 viewMatrix;
  uniform mat4 projectionMatrix;
  uniform float uTime;

  varying float vOpacity;

  void main() {
    vec3 particlePosition = position * ${PARTICLE_SPREAD.toFixed(1)};
    particlePosition.z *= 10.0;

    vec4 modelPosition = modelMatrix * vec4(particlePosition, 1.0);
    modelPosition.x += sin(uTime * random.z + 6.28318 * random.w) * mix(0.1, 1.5, random.x);
    modelPosition.y += sin(uTime * random.y + 6.28318 * random.x) * mix(0.1, 1.5, random.w);
    modelPosition.z += sin(uTime * random.w + 6.28318 * random.y) * mix(0.1, 1.5, random.z);

    vec4 viewPosition = viewMatrix * modelPosition;
    gl_PointSize = (88.0 * mix(0.62, 1.12, random.x)) / length(viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
    vOpacity = mix(0.42, 0.86, random.y);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  varying float vOpacity;

  void main() {
    float distanceFromCenter = length(gl_PointCoord - vec2(0.5));
    float circle = smoothstep(0.5, 0.38, distanceFromCenter);
    if (circle <= 0.0) discard;
    gl_FragColor = vec4(vec3(0.98), circle * vOpacity);
  }
`;

interface ParticleBackgroundProps {
    className?: string;
}

function createParticleData() {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const randoms = new Float32Array(PARTICLE_COUNT * 4);

    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
        let x = 0;
        let y = 0;
        let z = 0;
        let lengthSquared = 0;

        do {
            x = Math.random() * 2 - 1;
            y = Math.random() * 2 - 1;
            z = Math.random() * 2 - 1;
            lengthSquared = x * x + y * y + z * z;
        } while (lengthSquared > 1 || lengthSquared === 0);

        const radius = Math.cbrt(Math.random());
        positions.set([x * radius, y * radius, z * radius], index * 3);
        randoms.set([
            Math.random(),
            Math.random(),
            Math.random(),
            Math.random(),
        ], index * 4);
    }

    return { positions, randoms };
}

export function ParticleBackground({ className }: ParticleBackgroundProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return undefined;

        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        let releaseRenderer: (() => void) | undefined;

        const stopRenderer = () => {
            releaseRenderer?.();
            releaseRenderer = undefined;
        };

        const startRenderer = () => {
            stopRenderer();
            if (reducedMotion.matches || !window.WebGLRenderingContext) return;

            let renderer: Renderer | undefined;
            let geometry: Geometry | undefined;
            let program: Program | undefined;
            let frameId: number | undefined;
            let resizeObserver: ResizeObserver | undefined;
            let disposed = false;
            let contextInvalidated = false;

            const canvas = document.createElement('canvas');
            canvas.setAttribute('aria-hidden', 'true');
            Object.assign(canvas.style, {
                display: 'block',
                height: '100%',
                inset: '0',
                position: 'absolute',
                width: '100%',
            });

            let mesh: Mesh;
            let camera: Camera;
            let lastTime = performance.now();
            let elapsed = 0;

            const resize = () => {
                if (!renderer || !camera || disposed) return;
                const { width, height } = container.getBoundingClientRect();
                const safeWidth = Math.max(Math.round(width), 1);
                const safeHeight = Math.max(Math.round(height), 1);
                renderer.setSize(safeWidth, safeHeight);
                camera.perspective({ aspect: safeWidth / safeHeight });
            };

            const render = (time: number) => {
                frameId = undefined;
                if (disposed || contextInvalidated || document.hidden) return;
                const delta = Math.min(time - lastTime, 100);
                lastTime = time;
                elapsed += delta * PARTICLE_SPEED;
                program!.uniforms.uTime.value = elapsed * 0.001;

                mesh.rotation.x = Math.sin(elapsed * 0.0002) * 0.06;
                mesh.rotation.y = Math.cos(elapsed * 0.00035) * 0.08;
                renderer!.render({ scene: mesh, camera });
                frameId = requestAnimationFrame(render);
            };

            function handleVisibilityChange() {
                if (disposed || contextInvalidated) return;
                if (document.hidden) {
                    if (frameId !== undefined) cancelAnimationFrame(frameId);
                    frameId = undefined;
                    return;
                }
                lastTime = performance.now();
                if (frameId === undefined) frameId = requestAnimationFrame(render);
            }

            function handleContextLost(event: Event) {
                event.preventDefault();
                contextInvalidated = true;
                if (frameId !== undefined) cancelAnimationFrame(frameId);
                frameId = undefined;
            }

            function handleContextRestored() {
                if (disposed || reducedMotion.matches) return;
                startRenderer();
            }

            const release = () => {
                if (disposed) return;
                disposed = true;
                if (frameId !== undefined) cancelAnimationFrame(frameId);
                document.removeEventListener('visibilitychange', handleVisibilityChange);
                canvas.removeEventListener('webglcontextlost', handleContextLost);
                canvas.removeEventListener('webglcontextrestored', handleContextRestored);
                resizeObserver?.disconnect();
                window.removeEventListener('resize', resize);
                geometry?.remove();
                program?.remove();
                if (canvas.parentNode === container) container.removeChild(canvas);
                if (!contextInvalidated) {
                    renderer?.gl.getExtension('WEBGL_lose_context')?.loseContext();
                }
            };

            try {
                renderer = new Renderer({
                    alpha: true,
                    antialias: false,
                    canvas,
                    depth: false,
                    dpr: Math.min(window.devicePixelRatio || 1, 2),
                    powerPreference: 'low-power',
                });
                renderer.gl.clearColor(0, 0, 0, 0);

                camera = new Camera(renderer.gl, { fov: 15 });
                camera.position.set(0, 0, 20);

                const { positions, randoms } = createParticleData();
                geometry = new Geometry(renderer.gl, {
                    position: { data: positions, size: 3 },
                    random: { data: randoms, size: 4 },
                });
                program = new Program(renderer.gl, {
                    depthTest: false,
                    fragment: fragmentShader,
                    transparent: true,
                    uniforms: { uTime: { value: 0 } },
                    vertex: vertexShader,
                });
                if (!renderer.gl.getProgramParameter(program.program, renderer.gl.LINK_STATUS)) {
                    throw new Error('Unable to link the particle shader program');
                }
                mesh = new Mesh(renderer.gl, {
                    geometry,
                    mode: renderer.gl.POINTS,
                    program,
                });

                container.appendChild(canvas);
                resize();
                if (typeof ResizeObserver !== 'undefined') {
                    resizeObserver = new ResizeObserver(resize);
                    resizeObserver.observe(container);
                }
                // Cleanup is centralized in release(), which is also used after failed initialization.
                // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener
                window.addEventListener('resize', resize);
                // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener
                document.addEventListener('visibilitychange', handleVisibilityChange);
                // The renderer is rebuilt after a restored context; release() removes both listeners.
                // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener
                canvas.addEventListener('webglcontextlost', handleContextLost);
                // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener
                canvas.addEventListener('webglcontextrestored', handleContextRestored);
                if (!document.hidden) frameId = requestAnimationFrame(render);
                releaseRenderer = release;
            } catch {
                release();
            }
        };

        startRenderer();
        reducedMotion.addEventListener('change', startRenderer);

        return () => {
            reducedMotion.removeEventListener('change', startRenderer);
            stopRenderer();
        };
    }, []);

    return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={className}
      style={{
          backgroundColor: '#050505',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
          position: 'absolute',
          zIndex: -1,
      }}
    />
    );
}

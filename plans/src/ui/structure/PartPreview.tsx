// Aperçu 3D d'une pièce importée (atelier des accessoires) : maillage gris, rotation à la souris. Léger : une scène
// three.js propre à l'aperçu, détruite avec le composant.
import { useEffect, useRef } from 'react';
import { AmbientLight, BufferAttribute, BufferGeometry, Color, DirectionalLight, EdgesGeometry, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function PartPreview({ positions, height = 260 }: { positions: Float32Array; height?: number }) {
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = holder.current;
    if (!el || !positions.length) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true });
    } catch {
      el.textContent = 'Aperçu 3D indisponible (WebGL)';
      return;
    }
    const w = el.clientWidth || 400;
    renderer.setSize(w, height);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(renderer.domElement);
    const scene = new Scene();
    scene.background = new Color(0xf3f4f6);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(positions, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new Mesh(g, new MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.2, roughness: 0.7, flatShading: true }));
    scene.add(mesh);
    scene.add(new LineSegments(new EdgesGeometry(g, 20), new LineBasicMaterial({ color: 0x111827 })));
    scene.add(new AmbientLight(0xffffff, 0.6));
    const sun = new DirectionalLight(0xffffff, 1.2);
    sun.position.set(1, 2, 3);
    scene.add(sun);
    const s = g.boundingSphere!;
    const cam = new PerspectiveCamera(40, w / height, s.radius / 100, s.radius * 100);
    cam.position.copy(s.center.clone().add(new Vector3(1, 0.8, 1.2).normalize().multiplyScalar(s.radius * 3)));
    cam.lookAt(s.center);
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.target.copy(s.center);
    let raf = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, cam);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      controls.dispose();
      g.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [positions, height]);
  return <div ref={holder} style={{ width: '100%', height, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }} />;
}

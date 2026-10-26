/**
 * @file FinOps3DTopology.tsx
 * @description Hardware-accelerated 3D Interactive FinOps Dependency DAG & Payment Stream Topology.
 *
 * Implements:
 * - 3D WebGL Visualization using Three.js
 * - Interactive node raycasting, mouse parallax damping, and glowing dependency flow conduits
 * - Real-time color-coding reflecting ScheduleStatus and PayPal payment status
 * - Bi-directional synchronization with Bryntum Gantt and CascadeStateContext
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { useCascadeState } from '@/context/CascadeStateContext';
import { formatMinorToUSD } from '@/utils/formatters';
import {
  Boxes,
  Maximize2,
  RotateCcw,
  Sparkles,
  Zap,
  Info,
  Layers,
  Activity
} from 'lucide-react';
import type { CascadeTask, ScheduleStatus } from '@/types/domain';

interface NodeData {
  mesh: THREE.Mesh;
  halo: THREE.Mesh;
  taskId: string;
  name: string;
  status: ScheduleStatus;
  materialsUnlockMinor: number;
  burnMinor: number;
  originalPos: THREE.Vector3;
}

export const FinOps3DTopology: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state, selectedTaskId, selectTask } = useCascadeState();

  const [hoveredTask, setHoveredTask] = useState<CascadeTask | null>(null);
  const [isRotating, setIsRotating] = useState(true);

  // Status-to-color mapping
  const getStatusColor = (status: ScheduleStatus): number => {
    switch (status) {
      case 'COMPLETED':
        return 0x10b981; // emerald-500
      case 'PAYMENT_BLOCKED':
        return 0xf43f5e; // rose-500
      case 'REROUTED_ACTIVE':
        return 0x0ea5e9; // sky-500
      case 'READY_TO_PROMOTE':
        return 0xf59e0b; // amber-500
      case 'MATERIALS_ORDERED':
        return 0xa855f7; // purple-500
      default:
        return 0x64748b; // slate-500
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let width = container.clientWidth;
    let height = container.clientHeight;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b0f19, 0.035);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 1.5, 14);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 2. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 1.8);
    dirLight1.position.set(10, 15, 10);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x10b981, 1.2);
    dirLight2.position.set(-10, -5, 5);
    scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0xffffff, 2, 25);
    pointLight.position.set(0, 0, 8);
    scene.add(pointLight);

    // 3. Grid Plane Background
    const gridHelper = new THREE.GridHelper(30, 30, 0x1e293b, 0x0f172a);
    gridHelper.position.y = -3;
    scene.add(gridHelper);

    // 4. Create Task Nodes
    const tasks = state?.tasks || [];
    const nodeMap = new Map<string, NodeData>();
    const nodeGroup = new THREE.Group();
    scene.add(nodeGroup);

    // Sphere geometry & materials
    const sphereGeo = new THREE.SphereGeometry(0.55, 32, 32);
    const ringGeo = new THREE.RingGeometry(0.7, 0.85, 32);

    // Node positioning layout: 3D spatial curve
    tasks.forEach((task, index) => {
      const colorHex = getStatusColor(task.schedule_status);
      const isSelected = selectedTaskId === task.task_id;

      // Calculate spatial position
      const total = tasks.length;
      const x = ((index - (total - 1) / 2) * 2.8);
      const y = Math.sin((index / total) * Math.PI) * 1.5 - 0.5;
      const z = Math.cos((index / total) * Math.PI) * 1.8;

      // Core Sphere
      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: isSelected ? 0.8 : 0.35,
        roughness: 0.2,
        metalness: 0.8,
      });

      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.position.set(x, y, z);
      nodeGroup.add(mesh);

      // Outer Halo Ring
      const ringMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: isSelected ? 0.9 : 0.4,
      });
      const halo = new THREE.Mesh(ringGeo, ringMat);
      halo.position.set(x, y, z);
      halo.lookAt(camera.position);
      nodeGroup.add(halo);

      nodeMap.set(task.task_id, {
        mesh,
        halo,
        taskId: task.task_id,
        name: task.name,
        status: task.schedule_status,
        materialsUnlockMinor: task.materials_unlock_minor,
        burnMinor: task.daily_idle_burn_minor,
        originalPos: new THREE.Vector3(x, y, z),
      });
    });

    // 5. Create 3D Dependency Pipelines (Curved conduits between nodes)
    const dependencies = state?.dependencies || [];
    const flowParticles: { curve: THREE.CatmullRomCurve3; particle: THREE.Mesh; progress: number }[] = [];
    const pipeGroup = new THREE.Group();
    scene.add(pipeGroup);

    const particleGeo = new THREE.SphereGeometry(0.08, 12, 12);
    const particleMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    dependencies.forEach((dep) => {
      const fromNode = nodeMap.get(dep.from_task_id);
      const toNode = nodeMap.get(dep.to_task_id);

      if (fromNode && toNode) {
        const start = fromNode.originalPos;
        const end = toNode.originalPos;

        // Create curved mid-point
        const mid = new THREE.Vector3()
          .addVectors(start, end)
          .multiplyScalar(0.5)
          .add(new THREE.Vector3(0, 0.8, -0.5));

        const curve = new THREE.CatmullRomCurve3([start, mid, end]);
        const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.035, 8, false);
        const tubeMat = new THREE.MeshStandardMaterial({
          color: 0x334155,
          emissive: 0x1e293b,
          transparent: true,
          opacity: 0.6,
        });

        const tube = new THREE.Mesh(tubeGeo, tubeMat);
        pipeGroup.add(tube);

        // Animated flow particle
        const particle = new THREE.Mesh(particleGeo, particleMat);
        scene.add(particle);
        flowParticles.push({ curve, particle, progress: Math.random() });
      }
    });

    // 6. Mouse Interaction & Raycasting
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-999, -999);
    let targetCameraX = 0;
    let targetCameraY = 1.5;

    const handleMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      targetCameraX = mouse.x * 1.5;
      targetCameraY = 1.5 + mouse.y * 0.8;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(
        Array.from(nodeMap.values()).map((n) => n.mesh)
      );

      if (intersects.length > 0 && intersects[0]) {
        const hitMesh = intersects[0].object as THREE.Mesh;
        const entry = Array.from(nodeMap.values()).find((n) => n.mesh === hitMesh);
        if (entry) {
          const t = tasks.find((item) => item.task_id === entry.taskId);
          setHoveredTask(t || null);
          document.body.style.cursor = 'pointer';
        }
      } else {
        setHoveredTask(null);
        document.body.style.cursor = 'default';
      }
    };

    const handleClick = () => {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(
        Array.from(nodeMap.values()).map((n) => n.mesh)
      );

      if (intersects.length > 0 && intersects[0]) {
        const hitMesh = intersects[0].object as THREE.Mesh;
        const entry = Array.from(nodeMap.values()).find((n) => n.mesh === hitMesh);
        if (entry) {
          selectTask(entry.taskId);
        }
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);

    // 7. Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      // Camera parallax interpolation
      camera.position.x += (targetCameraX - camera.position.x) * 0.05;
      camera.position.y += (targetCameraY - camera.position.y) * 0.05;
      camera.lookAt(0, 0, 0);

      // Subtle scene rotation
      if (isRotating) {
        nodeGroup.rotation.y = Math.sin(time * 0.25) * 0.12;
        pipeGroup.rotation.y = nodeGroup.rotation.y;
      }

      // Animate Halos & Nodes
      nodeMap.forEach((entry) => {
        entry.halo.lookAt(camera.position);

        // Pulse blocked or selected nodes
        if (entry.status === 'PAYMENT_BLOCKED') {
          const scale = 1 + Math.sin(time * 5) * 0.12;
          entry.mesh.scale.set(scale, scale, scale);
        } else if (entry.taskId === selectedTaskId) {
          const scale = 1 + Math.sin(time * 3) * 0.08;
          entry.mesh.scale.set(scale, scale, scale);
        }
      });

      // Animate cashflow/dependency particles along curves
      flowParticles.forEach((fp) => {
        fp.progress = (fp.progress + delta * 0.4) % 1;
        const pt = fp.curve.getPointAt(fp.progress);
        fp.particle.position.copy(pt);
      });

      renderer.render(scene, camera);
    };

    animate();

    // 8. Resize Handler
    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth;
      height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
      cancelAnimationFrame(animationFrameId);
      document.body.style.cursor = 'default';
      renderer.dispose();
    };
  }, [state?.tasks, state?.dependencies, selectedTaskId, selectTask, isRotating]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[340px] lg:h-[380px] bg-[#07090e] rounded-2xl border border-neutral-200 dark:border-white/[0.08] overflow-hidden flex flex-col shadow-sm"
    >
      {/* 3D WebGL Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      {/* Top Overlay Controls */}
      <div className="absolute top-3 left-4 right-4 flex items-center justify-between pointer-events-none z-10">
        <div className="flex items-center space-x-2 bg-neutral-900/90 backdrop-blur-md px-2.5 py-1 rounded-lg border border-neutral-800 pointer-events-auto shadow-sm">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-[11px] font-mono font-medium tracking-wider text-neutral-200 uppercase">
            3D Topology
          </span>
        </div>

        <div className="flex items-center space-x-2 pointer-events-auto">
          <button
            onClick={() => setIsRotating((v) => !v)}
            className={`p-1.5 rounded-lg border transition-colors ${
              isRotating
                ? 'bg-neutral-800 text-white border-neutral-700'
                : 'bg-neutral-900/80 text-neutral-400 border-neutral-800 hover:text-white'
            }`}
            title="Toggle camera drift"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Bottom Floating Inspection Pill on Hover */}
      <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between pointer-events-none z-10">
        {hoveredTask ? (
          <div className="bg-[#090b10]/95 backdrop-blur-md border border-neutral-800 px-3 py-1.5 rounded-xl shadow-lg flex items-center space-x-3 pointer-events-auto">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono font-bold text-white">{hoveredTask.task_id}</span>
                <span className="text-xs font-medium text-neutral-200">{hoveredTask.name}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-neutral-900 text-neutral-300 border border-neutral-800">
                  {hoveredTask.schedule_status}
                </span>
              </div>
              <div className="flex items-center space-x-2 text-[10px] font-mono text-neutral-400 mt-0.5">
                <span>Unlock: <strong className="text-white">{formatMinorToUSD(hoveredTask.materials_unlock_minor)}</strong></span>
                <span>&bull;</span>
                <span>Burn: <strong className="text-rose-400">{formatMinorToUSD(hoveredTask.daily_idle_burn_minor)}/d</strong></span>
              </div>
            </div>
            <span className="text-[10px] font-mono text-neutral-400 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800">
              Filter
            </span>
          </div>
        ) : (
          <div />
        )}

        {/* Minimal Legend */}
        <div className="hidden sm:flex items-center space-x-3 text-[10px] font-mono bg-neutral-950/80 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-neutral-900">
          <div className="flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-neutral-400">Completed</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            <span className="text-neutral-400">Blocked</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            <span className="text-neutral-400">Rerouted</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="text-neutral-400">Ready</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinOps3DTopology;

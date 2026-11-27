// Scena 3D schematica per i video tecnici GT. Stessa figura, materiali e luci di
// public/training/movement.js, con pose parametrizzate per famiglia di esercizi.
// Eseguita solo da tools/technique-videos/render.mjs in Chromium headless.
import * as T from '/training/vendor/three.module.js';

const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const Y = V(0, 1, 0);
const mix = (a, b, t) => a + (b - a) * t;
const rad = d => (d * Math.PI) / 180;

/** Cinematica a due segmenti: gomito/ginocchio dato il vincolo spalla/anca → mano/piede. */
function joint(a, b, pole, len1 = .335, len2 = .315) {
  const d = a.distanceTo(b), dir = b.clone().sub(a).normalize();
  const along = Math.min(len1, Math.max(0, (len1 * len1 - len2 * len2 + d * d) / (2 * Math.max(d, .01))));
  const bend = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  return a.clone().addScaledVector(dir, along).addScaledVector(bend, Math.sqrt(Math.max(.001, len1 * len1 - along * along)));
}
const legJoint = (a, b, pole) => joint(a, b, pole, .49, .475);

const MUSCLES = {
  press: ['chest', 'triceps', 'shoulders'],
  fly: ['chest'], dbfly: ['chest'],
  legpress: ['quads', 'glutes'], legext: ['quads'],
  row: ['back', 'biceps'], reardelt: ['shoulders', 'back'],
};

/** s: 0 = posizione di partenza (fine fase concentrica/ritorno), 1 = punto opposto. */
function pose(spec, s) {
  const k = spec.kind;
  let hip = V(0, 1.04, 0), spine = V(0, 1, 0);
  let knees = [V(-.17, .55, .025), V(.17, .55, .025)], feet = [V(-.18, .075, .06), V(.18, .075, .06)];
  const hands = [], elbows = [];

  if (k === 'press' || k === 'dbfly') {
    const A = rad(spec.back ?? 0);
    const seated = spec.implement === 'machine';
    const d = V(0, Math.sin(A), -Math.cos(A));
    const n = V(0, Math.cos(A), Math.sin(A));
    if (seated) {
      hip = V(0, .52, .05);
      knees = [V(-.21, .55, .50), V(.21, .55, .50)];
      feet = [V(-.23, .075, .62), V(.23, .075, .62)];
    } else {
      hip = V(0, mix(.585, .60, Math.min(1, A / rad(45))), mix(.34, .30, Math.min(1, A / rad(45))));
      const t = Math.min(1, A / rad(45));
      knees = [V(-.20, mix(.43, .64, t), mix(.72, .74, t)), V(.20, mix(.43, .64, t), mix(.72, .74, t))];
      feet = [V(-.23, .075, mix(.84, .86, t)), V(.23, .075, mix(.84, .86, t))];
    }
    spine = d.clone().normalize();
    const sc = hip.clone().addScaledVector(spine, .61);
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? -1 : 1, a = sc.clone().add(V(sign * .29, 0, 0));
      let h;
      if (k === 'dbfly') {
        const phi = rad(mix(82, 6, s));
        h = a.clone().add(V(-sign * 0 + sign * Math.cos(phi) * .56, Math.sin(phi) * .56, .0)).addScaledVector(n, .02);
        h.x = Math.max(Math.abs(h.x), .12) * sign;
        elbows.push(joint(a, h, V(sign * .5, -.9, .25))); hands.push(h); continue;
      }
      if (seated) {
        const bottom = sc.clone().addScaledVector(n, .20), top = sc.clone().addScaledVector(n, .60);
        h = V(sign * .38, mix(top.y, bottom.y, s), mix(top.z, bottom.z, s));
        elbows.push(joint(a, h, V(sign * .8, -.5, -.6)));
      } else {
        const wide = spec.implement === 'dumbbell' ? mix(.31, .47, s) : .40;
        const chest = sc.clone().addScaledVector(n, .21).addScaledVector(spine, -.03);
        const top = sc.clone().add(V(0, .60, spec.back ? .02 : -.0));
        h = V(sign * wide, mix(top.y, chest.y, s), mix(top.z, chest.z, s));
        elbows.push(joint(a, h, V(sign, -.6, .15)));
      }
      hands.push(h);
    }
    return { hip, spine, shoulders: [sc.clone().add(V(-.29, 0, 0)), sc.clone().add(V(.29, 0, 0))], hands, elbows, knees, feet };
  }

  if (k === 'fly') {
    feet = [V(-.18, .075, .22), V(.18, .075, -.10)];
    knees = [V(-.17, .55, .15), V(.17, .55, -.03)];
    const sc = hip.clone().addScaledVector(spine, .61);
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? -1 : 1, a = sc.clone().add(V(sign * .29, 0, 0));
      const h = V(sign * mix(.82, .07, s), 1.43, mix(.11, .60, s));
      hands.push(h); elbows.push(joint(a, h, V(sign, -.15, -.3)));
    }
    return { hip, spine, shoulders: [sc.clone().add(V(-.29, 0, 0)), sc.clone().add(V(.29, 0, 0))], hands, elbows, knees, feet };
  }

  if (k === 'legpress') {
    const A = rad(38);
    hip = V(0, .46, -.05);
    spine = V(0, Math.sin(A), -Math.cos(A));
    const r = V(0, Math.sin(rad(40)), Math.cos(rad(40)));
    const sc = hip.clone().addScaledVector(spine, .61);
    const reach = mix(.93, .56, s);
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? -1 : 1, hipJoint = hip.clone().add(V(sign * .13, 0, 0));
      const foot = hipJoint.clone().addScaledVector(r, reach).add(V(sign * .07, 0, 0));
      feet[i] = foot.clone().add(V(0, .02, 0));
      knees[i] = legJoint(hipJoint, foot, V(sign * .35, 1, -.1));
      const sh = sc.clone().add(V(sign * .29, 0, 0));
      const h = hip.clone().add(V(sign * .27, .13, .02));
      hands.push(h); elbows.push(joint(sh, h, V(sign, -.4, 0)));
    }
    return { hip, spine, shoulders: [sc.clone().add(V(-.29, 0, 0)), sc.clone().add(V(.29, 0, 0))], hands, elbows, knees, feet, sled: r, reach, hipJointY: hip.y };
  }

  if (k === 'legext') {
    const A = rad(78);
    hip = V(0, .52, .02); spine = V(0, Math.sin(A), -Math.cos(A));
    const sc = hip.clone().addScaledVector(spine, .61);
    const theta = rad(mix(6, 88, s)); // angolo dalla verticale: 6° = gamba piegata, 88° = quasi in estensione
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? -1 : 1;
      const k0 = V(sign * .20, .56, .46);
      knees[i] = k0;
      feet[i] = k0.clone().add(V(0, -Math.cos(theta) * .46, Math.sin(theta) * .46));
      const sh = sc.clone().add(V(sign * .29, 0, 0));
      const h = V(sign * .30, .50, .12);
      hands.push(h); elbows.push(joint(sh, h, V(sign, -.4, 0)));
    }
    return { hip, spine, shoulders: [sc.clone().add(V(-.29, 0, 0)), sc.clone().add(V(.29, 0, 0))], hands, elbows, knees, feet };
  }

  if (k === 'row' || k === 'reardelt') {
    const lean = rad(k === 'row' ? 42 : 36);
    hip = V(0, .98, -.22);
    spine = V(0, Math.sin(lean), Math.cos(lean));
    knees = [V(-.18, .53, .06), V(.18, .53, .06)];
    feet = [V(-.20, .075, .02), V(.20, .075, .02)];
    const sc = hip.clone().addScaledVector(spine, .61);
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? -1 : 1, a = sc.clone().add(V(sign * .29, 0, 0));
      let h, e;
      if (k === 'row') {
        h = V(sign * .40, mix(.80, 1.10, s), mix(.30, .10, s));
        e = joint(a, h, V(sign * .6, .1, -1));
      } else {
        const ang = mix(.06, 1.38, s);
        e = a.clone().add(V(sign * Math.sin(ang) * .33, -Math.cos(ang) * .33, -.02));
        h = e.clone().add(V(sign * Math.sin(ang) * .30, -Math.cos(ang) * .30, .03));
      }
      hands.push(h); elbows.push(e);
    }
    return { hip, spine, shoulders: [sc.clone().add(V(-.29, 0, 0)), sc.clone().add(V(.29, 0, 0))], hands, elbows, knees, feet };
  }
  throw new Error('kind non supportato: ' + k);
}

export function build(host, spec, size) {
  const kind = spec.kind;
  const scene = new T.Scene(); scene.background = new T.Color(0x060b18);
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(size.w, size.h, false);
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  host.append(renderer.domElement);
  const camera = new T.PerspectiveCamera(31, size.w / size.h, .1, 30);
  const target = V(...spec.camera.target), distance = spec.camera.distance;
  function setCamera(yaw) {
    camera.position.set(target.x + Math.sin(yaw) * distance, target.y + spec.camera.height, target.z + Math.cos(yaw) * distance);
    camera.lookAt(target);
  }
  setCamera(.9);
  scene.add(new T.HemisphereLight(0xdbe9ff, 0x17122e, 1.65));
  const key = new T.DirectionalLight(0xf5efff, 3.1); key.position.set(2, 4, 4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key);
  const cyan = new T.PointLight(0x20cfff, 13, 7); cyan.position.set(-2, 2, 1); scene.add(cyan);
  const violet = new T.PointLight(0xae48ff, 17, 7); violet.position.set(2, 2.7, -2); scene.add(violet);
  const base = new T.MeshStandardMaterial({ color: 0x9daabc, roughness: .37, metalness: .48 });
  const dark = new T.MeshStandardMaterial({ color: 0x1a2639, roughness: .55, metalness: .25 });
  const chrome = new T.MeshStandardMaterial({ color: 0xa4b1c4, roughness: .21, metalness: .88 });
  const padMat = new T.MeshStandardMaterial({ color: 0x1b2a45, roughness: .6, metalness: .2 });
  const purple = new T.MeshStandardMaterial({ color: 0x9f4be9, emissive: 0x510c8e, emissiveIntensity: .43, roughness: .33, metalness: .35 });
  const active = new Set(MUSCLES[kind]);
  const gm = new T.SphereGeometry(1, 24, 18), cyl = new T.CylinderGeometry(1, 1, 1, 24), box = new T.BoxGeometry(1, 1, 1);
  const actor = new T.Group(); scene.add(actor);
  const torso = new T.Group(); actor.add(torso);
  function mesh(parent, geometry, material, scale, pos) { const m = new T.Mesh(geometry, material); m.scale.set(...scale); m.position.set(...pos); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  const ell = (parent, scale, pos, material = base) => mesh(parent, gm, material, scale, pos);
  const mat = g => active.has(g) ? purple : base;
  const profile = [[.12, 0], [.175, .075], [.145, .18], [.16, .30], [.215, .43], [.225, .53], [.20, .60], [.13, .66]].map(([r, y]) => new T.Vector2(r, y));
  mesh(torso, new T.LatheGeometry(profile, 40), base, [1.3, 1, .72], [0, 0, 0]);
  ell(torso, [.18, .125, .125], [0, .025, 0], dark);
  for (const sign of [-1, 1]) {
    const pec = ell(torso, [.145, .102, .065], [sign * .143, .505, .142], mat('chest')); pec.rotation.z = sign * .08;
    const lat = ell(torso, [.105, .19, .05], [sign * .17, .43, -.12], mat('back')); lat.rotation.z = sign * -.22;
    ell(torso, [.09, .105, .04], [sign * .09, .605, -.10], mat('back'));
    for (let n = 0; n < 3; n++) ell(torso, [.059, .038, .028], [sign * .063, .22 + n * .075, .118], base);
    const ob = ell(torso, [.046, .135, .035], [sign * .148, .29, .075], base); ob.rotation.z = sign * -.19;
  }
  ell(torso, [.07, .07, .065], [0, .70, 0]);
  ell(torso, [.104, .137, .104], [0, .86, .005]);
  ell(torso, [.079, .065, .058], [0, .815, .048]);
  ell(torso, [.016, .027, .024], [0, .849, .108]);
  for (const sign of [-1, 1]) { ell(torso, [.019, .034, .016], [sign * .104, .856, .003]); ell(torso, [.030, .008, .007], [sign * .039, .883, .101], dark); }
  const arms = [], legs = [];
  const segment = (material, r) => ell(actor, [r, .2, r * .86], [0, 0, 0], material);
  const triceps = ['press', 'dbfly'].includes(kind);
  for (let i = 0; i < 2; i++) {
    const shoulder = ell(actor, [.109, .115, .107], [0, 0, 0], mat('shoulders'));
    const upper = segment(mat(triceps ? 'triceps' : 'biceps'), .087);
    const elbowJoint = ell(actor, [.064, .068, .061], [0, 0, 0]);
    const fore = segment(base, .066); const hand = ell(actor, [.057, .080, .040], [0, 0, 0]);
    arms.push({ shoulder, upper, elbowJoint, fore, hand });
    legs.push({ thigh: segment(mat('quads'), .114), knee: ell(actor, [.075, .073, .071], [0, 0, 0]), calf: segment(base, .078), shoe: ell(actor, [.085, .06, .15], [0, 0, 0], dark) });
  }
  const positionSegment = (m, a, b, r) => { m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize()); m.scale.set(r, a.distanceTo(b) * .59, r * .86); };

  const equipment = new T.Group(); scene.add(equipment);
  const cube = (scale, pos, material = dark) => mesh(equipment, box, material, scale, pos);
  function rod(a, b, r = .025, material = chrome) { const m = mesh(equipment, cyl, material, [r, 1, r], [0, 0, 0]); m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize()); m.scale.y = a.distanceTo(b); return m; }
  const oriented = (m, dir) => { m.quaternion.setFromUnitVectors(Y, dir); return m; };

  // Attrezzatura statica / semi-statica per famiglia
  let pushPad = null, sled = null, legPad = null;
  const A = rad(spec.back ?? 0);
  if (kind === 'press' || kind === 'dbfly') {
    const seatless = spec.implement === 'machine';
    if (!seatless) {
      const hip = pose(spec, 0).hip, d = V(0, Math.sin(A), -Math.cos(A)), n = V(0, Math.cos(A), Math.sin(A));
      if (spec.back > 5) {
        cube([.43, .10, .40], [0, hip.y - .06, hip.z + .17]);
        const back = cube([.43, .105, 1.0], [0, 0, 0]); back.position.copy(hip).addScaledVector(d, .46).addScaledVector(n, -.07); back.quaternion.setFromUnitVectors(V(0, 0, -1), d);
        rod(V(0, .02, hip.z + .16), V(0, hip.y - .12, hip.z + .16), .035, chrome);
        rod(hip.clone().addScaledVector(d, .06).add(V(0, -.2, 0)), hip.clone().addScaledVector(d, .70).addScaledVector(n, -.15), .03, chrome);
        cube([.65, .045, .10], [0, .025, hip.z + .17]); cube([.65, .045, .10], [0, .025, hip.z - .40 * Math.cos(A) - .1]);
      } else {
        cube([.43, .105, 1.27], [0, .49, .10]); cube([.07, .44, .06], [0, .22, -.36], chrome); cube([.07, .44, .06], [0, .22, .52], chrome);
        cube([.65, .045, .10], [0, .025, -.36]); cube([.65, .045, .10], [0, .025, .52]);
      }
      if (spec.implement === 'barbell') { // rack montanti
        for (const sign of [-1, 1]) rod(V(sign * .62, 0, -.52), V(sign * .62, 1.45, -.52), .03, dark);
      }
    } else { // macchina: seduta, schienale, telaio, pacco pesi
      const hip = pose(spec, 0).hip, d = V(0, Math.sin(A), -Math.cos(A)), n = V(0, Math.cos(A), Math.sin(A));
      cube([.50, .10, .46], [0, hip.y - .08, hip.z + .12], padMat);
      const back = cube([.50, .11, .95], [0, 0, 0], padMat); back.position.copy(hip).addScaledVector(d, .44).addScaledVector(n, -.10); back.quaternion.setFromUnitVectors(V(0, 0, -1), d);
      for (const sign of [-1, 1]) { rod(V(sign * .56, 0, -.45), V(sign * .56, 1.75, -.45), .04, dark); rod(V(sign * .56, 1.55, -.45), V(sign * .50, 1.55, .0), .03, dark); }
      rod(V(-.56, 1.75, -.45), V(.56, 1.75, -.45), .04, dark);
      cube([.80, .05, 1.0], [0, .025, -.05]); cube([.38, 1.3, .22], [0, .75, -.72], dark);
      for (let n2 = 0; n2 < 8; n2++) cube([.34, .05, .18], [0, .25 + n2 * .1, -.72], chrome);
    }
  }
  if (kind === 'legext') {
    const hip = pose(spec, 0).hip, d = V(0, Math.sin(rad(78)), -Math.cos(rad(78))), n = V(0, Math.cos(rad(78)), Math.sin(rad(78)));
    cube([.50, .10, .50], [0, hip.y - .07, hip.z + .20], padMat);
    const back = cube([.50, .11, .90], [0, 0, 0], padMat); back.position.copy(hip).addScaledVector(d, .42).addScaledVector(n, -.10); back.quaternion.setFromUnitVectors(V(0, 0, -1), d);
    cube([.8, .05, 1.1], [0, .025, .1]); cube([.36, 1.2, .2], [0, .70, -.56], dark);
    for (let n2 = 0; n2 < 7; n2++) cube([.32, .05, .16], [0, .25 + n2 * .1, -.56], chrome);
    rod(V(0, .3, .46), V(0, .56, .46), .035, chrome);
    legPad = mesh(equipment, cyl, padMat, [.055, .30, .055], [0, 0, 0]); legPad.rotation.z = Math.PI / 2;
  }
  if (kind === 'legpress') {
    const r = V(0, Math.sin(rad(40)), Math.cos(rad(40)));
    const hip = pose(spec, 0).hip, d = V(0, Math.sin(rad(38)), -Math.cos(rad(38))), n = V(0, Math.cos(rad(38)), Math.sin(rad(38)));
    const back = cube([.52, .11, 1.05], [0, 0, 0], padMat); back.position.copy(hip).addScaledVector(d, .46).addScaledVector(n, -.11); back.quaternion.setFromUnitVectors(V(0, 0, -1), d);
    cube([.5, .09, .42], [0, hip.y - .07, hip.z + .15], padMat);
    for (const sign of [-1, 1]) {
      const a = hip.clone().add(V(sign * .36, -.22, -.35)), b = hip.clone().addScaledVector(r, 1.55).add(V(sign * .36, -.20, 0));
      rod(a, b, .035, dark); rod(V(sign * .36, 0, -.45), V(sign * .36, .24, -.35), .035, dark); rod(V(sign * .36, 0, b.z), V(sign * .36, b.y, b.z), .035, dark);
      cube([.07, .04, 2.0], [sign * .36, .02, .55]);
    }
    sled = new T.Group(); equipment.add(sled);
    const plate = mesh(sled, box, dark, [.78, .05, .66], [0, 0, 0]);
    const shine = mesh(sled, box, chrome, [.70, .012, .58], [0, .03, 0]);
    for (const sign of [-1, 1]) for (let n2 = 0; n2 < 2; n2++) { const wp = mesh(sled, cyl, dark, [.14, .05, .14], [sign * (.44 + n2 * .06), -.07, 0]); wp.rotation.z = Math.PI / 2; }
    void plate; void shine;
  }

  // Cavi (croci in piedi)
  const cableMat = new T.LineBasicMaterial({ color: 0x8999bc }); const cables = [];
  if (kind === 'fly') {
    for (const sign of [-1, 1]) { rod(V(sign * 1.0, 0, -.20), V(sign * 1.0, 1.9, -.20), .035, dark); cube([.30, .04, .30], [sign * 1, 0, -.20]); }
    for (let i = 0; i < 2; i++) { const g = new T.BufferGeometry().setFromPoints([V(), V()]); const line = new T.Line(g, cableMat); equipment.add(line); cables.push(line); }
  }
  // Attrezzi in mano
  function weightSet() { const g = new T.Group(); equipment.add(g); mesh(g, cyl, chrome, [.018, .25, .018], [0, 0, 0]).rotation.z = Math.PI / 2; for (const sign of [-1, 1]) { const d = mesh(g, cyl, dark, [.073, .05, .073], [sign * .105, 0, 0]); d.rotation.z = Math.PI / 2; const cap = mesh(g, cyl, chrome, [.027, .055, .027], [sign * .108, 0, 0]); cap.rotation.z = Math.PI / 2; } return g; }
  const dumbbells = (spec.implement === 'dumbbell' || kind === 'reardelt' || kind === 'dbfly') ? [weightSet(), weightSet()] : [];
  let bar = null; const handles = [];
  if (spec.implement === 'barbell' || kind === 'row') {
    bar = new T.Group(); equipment.add(bar);
    mesh(bar, cyl, chrome, [.018, 1.75, .018], [0, 0, 0]).rotation.z = Math.PI / 2;
    for (const sign of [-1, 1]) for (let n = 0; n < 2; n++) { const plate = mesh(bar, cyl, dark, [.185, .045, .185], [sign * (.64 + n * .055), 0, 0]); plate.rotation.z = Math.PI / 2; const rim = mesh(bar, new T.TorusGeometry(.179, .006, 8, 36), chrome, [1, 1, 1], [sign * (.64 + n * .055), 0, 0]); rim.rotation.y = Math.PI / 2; }
  }
  const levers = [];
  if (spec.implement === 'machine') {
    for (let i = 0; i < 2; i++) { const g = mesh(equipment, cyl, chrome, [.022, .13, .022], [0, 0, 0]); g.rotation.z = Math.PI / 2; handles.push(g); const l = mesh(equipment, cyl, dark, [.03, 1, .03], [0, 0, 0]); levers.push(l); }
  }
  const floor = new T.Mesh(new T.CircleGeometry(1.5, 64), new T.MeshStandardMaterial({ color: 0x080e1d, roughness: .9, metalness: .1 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const circle = new T.Mesh(new T.RingGeometry(1.05, 1.059, 80), new T.MeshBasicMaterial({ color: 0x8e3fdf, transparent: true, opacity: .55, side: T.DoubleSide })); circle.rotation.x = -Math.PI / 2; circle.position.y = .003; scene.add(circle);

  function draw(s, yaw) {
    const p = pose(spec, s); setCamera(yaw);
    torso.position.copy(p.hip); torso.quaternion.setFromUnitVectors(Y, p.spine);
    for (let i = 0; i < 2; i++) {
      const a = arms[i], l = legs[i], sign = i === 0 ? -1 : 1;
      a.shoulder.position.copy(p.shoulders[i]); a.elbowJoint.position.copy(p.elbows[i]);
      positionSegment(a.upper, p.shoulders[i], p.elbows[i], .086); positionSegment(a.fore, p.elbows[i], p.hands[i], .065);
      a.hand.position.copy(p.hands[i]); a.hand.quaternion.copy(a.fore.quaternion);
      const hipJoint = p.hip.clone().add(V(sign * .13, 0, 0));
      positionSegment(l.thigh, hipJoint, p.knees[i], .112); l.knee.position.copy(p.knees[i]); positionSegment(l.calf, p.knees[i], p.feet[i], .075);
      l.shoe.position.copy(p.feet[i]).add(V(0, -.018, kind === 'legpress' ? 0 : .065));
      if (kind === 'legpress') l.shoe.quaternion.setFromUnitVectors(Y, p.sled);
      if (dumbbells[i]) dumbbells[i].position.copy(p.hands[i]);
      if (cables[i]) { const arr = cables[i].geometry.attributes.position; arr.setXYZ(0, sign * 1.0, 1.67, -.20); arr.setXYZ(1, ...p.hands[i].toArray()); arr.needsUpdate = true; }
      if (handles[i]) { handles[i].position.copy(p.hands[i]); const pivot = V(sign * .56, 1.55, -.45), hand = p.hands[i]; levers[i].position.copy(pivot).add(hand).multiplyScalar(.5); levers[i].quaternion.setFromUnitVectors(Y, hand.clone().sub(pivot).normalize()); levers[i].scale.set(.03, pivot.distanceTo(hand), .03); }
    }
    if (bar) bar.position.copy(p.hands[0]).add(p.hands[1]).multiplyScalar(.5);
    if (sled) { const r = p.sled; sled.position.copy(p.hip).addScaledVector(r, p.reach + .12); sled.quaternion.setFromUnitVectors(Y, r); }
    if (legPad) { const mid = p.feet[0].clone().add(p.feet[1]).multiplyScalar(.5); legPad.position.copy(mid).add(V(0, .02, -.03)); legPad.scale.set(.055, .36, .055); }
    renderer.render(scene, camera);
  }
  return { draw, canvas: renderer.domElement };
}

import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const smooth = (v) => v * v * (3 - 2 * v);

function skinTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  let seed = 17331;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  ctx.fillStyle = '#8c999e'; ctx.fillRect(0, 0, 512, 512);
  // Broad, translucent pigment under fine pores: skin rather than a uniform silhouette.
  for (let i = 0; i < 190; i++) {
    const x = random() * 512, y = random() * 512, r = 9 + random() * 64;
    const stain = ctx.createRadialGradient(x, y, 0, x, y, r);
    stain.addColorStop(0, i % 3 === 0 ? '#443c5555' : '#3f514240');
    stain.addColorStop(1, '#51465200');
    ctx.fillStyle = stain; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 32000; i++) {
    const value = 45 + random() * 120;
    ctx.fillStyle = `rgba(${value},${value - 4},${value - 12},${.03 + random() * .1})`;
    ctx.fillRect(random() * 512, random() * 512, .6 + random(), .8 + random() * 1.6);
  }
  for (let i = 0; i < 47; i++) {
    let x = random() * 512, y = random() * 512;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let j = 0; j < 7; j++) { x += (random() - .5) * 12; y += 4 + random() * 10; ctx.lineTo(x, y); }
    ctx.strokeStyle = i % 2 ? '#41475624' : '#cac0a51b'; ctx.lineWidth = .4 + random() * .8; ctx.stroke();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  return map;
}

function ringSurface(profile, { ribs = false, ragged = false } = {}) {
  const vertices = [], uv = [], indices = [];
  const radial = 32, rings = 40;
  // x/z are cross-section radii; the fourth value traces the curved spine.
  const outline = new THREE.CatmullRomCurve3(profile.map(([y, x, z]) => new THREE.Vector3(x, y, z)));
  const spine = new THREE.CatmullRomCurve3(profile.map(([y, , , offset = 0]) => new THREE.Vector3(0, y, offset)));
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, p = outline.getPoint(t), centre = spine.getPoint(t);
    for (let j = 0; j <= radial; j++) {
      const angle = j / radial * TAU, front = Math.cos(angle);
      const ridge = ribs && p.y > 1.66 && p.y < 2.13 ? Math.sin((p.y - 1.66) * 69) * .01 * Math.sin((p.y - 1.66) / .47 * Math.PI) : 0;
      const asymmetric = ribs ? .014 * Math.sin(t * Math.PI) : 0;
      const hem = ragged && i < 4 ? (1 - i / 4) * (.075 * Math.sin(angle + .8) + .031 * Math.sin(angle * 11) + .024 * Math.sin(angle * 17)) : 0;
      vertices.push(Math.sin(angle) * (p.x + ridge) + asymmetric, p.y + hem, centre.z + front * (p.z + ridge));
      uv.push(j / radial, t);
      if (i < rings && j < radial) {
        const a = i * (radial + 1) + j, b = a + radial + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

/** A hunched, fully articulated figure. Gait advances only when its world position moves. */
export function createEntity() {
  const group = new THREE.Group();
  group.name = 'The listener';
  const anatomy = new THREE.Group(); group.add(anatomy);
  const map = skinTexture();
  const skin = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: .013, color: '#bdc6cd', roughness: .94, metalness: 0 });
  const shadowSkin = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: .008, color: '#b1bbc0', roughness: .97 });
  const cavity = new THREE.MeshStandardMaterial({ color: '#171714', roughness: .99 });
  const lip = new THREE.MeshStandardMaterial({ map, color: '#7c8186', roughness: .94 });
  const cloth = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: .018, color: '#545a55', roughness: 1, side: THREE.DoubleSide });
  const sphere = new THREE.SphereGeometry(1, 20, 16);
  const local = (v) => new THREE.Vector3(...v);
  function mesh(geometry, material, parent = anatomy) {
    const object = new THREE.Mesh(geometry, material); object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
  }
  function ellipsoid(scale, position, material = skin, parent = anatomy) {
    const object = mesh(sphere, material, parent); object.scale.set(...scale); object.position.set(...position); return object;
  }
  function curve(points, radius, material = skin, parent = anatomy, tubular = 10) {
    return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(local)), tubular, radius, 7, false), material, parent);
  }
  function segment(radius, taper = .7, material = skin, parent = anatomy, depth = .87) {
    // A slight belly and pinched ends make the limbs read as tendons and muscle.
    const object = mesh(ringSurface([[0, radius * .82, radius * depth * .82], [.16, radius, radius * depth], [.42, radius * .95, radius * depth * .95], [.79, radius * taper * 1.1, radius * taper * depth], [1, radius * taper, radius * taper * depth]]), material, parent);
    return object;
  }
  const direction = new THREE.Vector3();
  function placeSegment(object, start, end) {
    direction.subVectors(end, start);
    object.position.copy(start); object.scale.set(1, direction.length(), 1);
    object.quaternion.setFromUnitVectors(UP, direction.normalize());
  }

  const torso = mesh(ringSurface([
    [1.29, .16, .108, -.052], [1.43, .165, .104, -.035], [1.63, .148, .087, -.008],
    [1.84, .179, .126, .04], [2.02, .226, .161, .105], [2.15, .244, .146, .172],
    [2.24, .144, .091, .251], [2.29, .074, .065, .285],
  ], { ribs: true }), skin);
  // Clavicles, protruding shoulder blades and a curved chain of vertebrae.
  for (const side of [-1, 1]) {
    curve([[side * .028, 2.174, .293], [side * .11, 2.189, .291], [side * .205, 2.139, .266]], .011);
    const scapula = ellipsoid([.077, .12, .018], [side * .13, 2.051, -.04], skin); scapula.rotation.z = side * -.24;
    curve([[side * .036, 2.298, .31], [side * .063, 2.239, .273], [side * .095, 2.199, .27]], .011, skin);
  }
  for (let i = 0; i < 9; i++) {
    const y = 1.66 + i * .062;
    ellipsoid([.016, .025, .021], [.009, y, -.102 + Math.max(0, y - 1.82) * .39], skin);
  }
  mesh(ringSurface([[.88, .265, .214, .016], [1.08, .235, .182, -.005], [1.26, .2, .147, -.025], [1.43, .175, .126, -.033], [1.47, .166, .113, -.025]], { ragged: true }), cloth);
  const neck = segment(.064, .8);
  placeSegment(neck, local([.022, 2.225, .244]), local([.034, 2.375, .359]));

  const head = new THREE.Group(); head.position.set(.051, 2.471, .425); anatomy.add(head);
  const skullGeometry = new THREE.SphereGeometry(1, 48, 40);
  const positions = skullGeometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    let x = positions.getX(i) * .139, y = positions.getY(i) * .244, z = positions.getZ(i) * .162;
    if (y < -.04) x *= 1 - clamp((-y - .04) / .21, 0, .54);
    if (z > 0) {
      for (const side of [-1, 1]) {
        const socket = Math.exp(-((x - side * .053) ** 2 / .0013 + (y - .037) ** 2 / .0015));
        z -= socket * .047;
        z += Math.exp(-((x - side * .055) ** 2 / .00165 + (y - .095) ** 2 / .00024)) * .017;
        z += Math.exp(-((x - side * .077) ** 2 / .0012 + (y + .027) ** 2 / .00075)) * .016;
      }
      z -= Math.exp(-(x * x / .0014 + (y + .119) ** 2 / .0023)) * .028;
    }
    positions.setXYZ(i, x, y, z);
  }
  skullGeometry.computeVertexNormals(); mesh(skullGeometry, skin, head);
  for (const side of [-1, 1]) {
    const eye = ellipsoid([.026, .03, .01], [side * .052, .035, .098], cavity, head); eye.rotation.z = side * -.13;
    ellipsoid([.014, .045, .012], [side * .134, .003, -.002], skin, head);
  }
  ellipsoid([.014, .044, .018], [0, -.002, .149], skin, head);
  ellipsoid([.019, .012, .022], [.002, -.034, .155], skin, head);
  // An uneven, slightly hanging jaw and narrow cavity, without a smiling expression.
  ellipsoid([.026, .032, .007], [.004, -.124, .112], cavity, head);
  curve([[-.04, -.11, .112], [-.016, -.106, .127], [.016, -.108, .127], [.038, -.114, .111]], .0035, lip, head, 12);
  const hair = new THREE.MeshStandardMaterial({ color: '#26291f', roughness: 1 });
  for (let i = 0; i < 17; i++) {
    const side = i % 2 ? -1 : 1, offset = (i / 17) * .07;
    curve([[side * (.085 + offset * .3), .171, -.016 - offset], [side * (.137 + offset * .2), .07, -.059 - offset], [side * (.141 + offset * .15), -.12 - offset, -.05]], .0018, hair, head, 7);
  }

  const legs = [-1, 1].map((side) => ({
    side, upper: segment(.085, .68), lower: segment(.057, .6), knee: ellipsoid([.061, .061, .061], [0, 0, 0], skin),
    foot: ellipsoid([.054, .047, .141], [0, 0, 0], skin),
    anchor: new THREE.Vector3(), swingStart: new THREE.Vector3(), desired: new THREE.Vector3(), phase: side < 0 ? 0 : .5,
  }));
  const arms = [-1, 1].map((side) => {
    const hand = new THREE.Group(); anatomy.add(hand);
    const palm = ellipsoid([.052, .099, .027], [0, -.083, 0], skin, hand); palm.rotation.z = side * .09;
    ellipsoid([.027, .021, .028], [0, -.008, 0], shadowSkin, hand);
    const fingers = [];
    for (let i = 0; i < 4; i++) {
      const root = new THREE.Group(); root.position.set((i - 1.5) * .028, -.154 + Math.abs(i - 1.5) * .009, 0);
      root.rotation.z = -(i - 1.5) * .078; hand.add(root);
      const length = [ .174, .212, .224, .184 ][i];
      let parent = root;
      for (let joint = 0; joint < 3; joint++) {
        const phalanx = new THREE.Group(); parent.add(phalanx);
        if (joint) phalanx.position.y = -length * (joint === 1 ? .43 : .33);
        phalanx.rotation.x = -.13 - joint * .12;
        const bone = segment(.01 - joint * .0018, .82, skin, phalanx);
        placeSegment(bone, local([0, 0, 0]), local([0, -length * [.43, .33, .24][joint], 0]));
        ellipsoid([.0095 - joint * .0015, .012, .01 - joint * .0015], [0, 0, 0], shadowSkin, phalanx);
        fingers.push({ pivot: phalanx, base: phalanx.rotation.x, offset: i * .74 + side });
        parent = phalanx;
      }
    }
    curve([[side * .032, -.054, .005], [side * .075, -.098, .008], [side * .095, -.159, .024], [side * .081, -.2, .041]], .012, skin, hand);
    for (let i = -1; i <= 1; i++) curve([[i * .016, -.02, -.025], [i * .022, -.1, -.027], [i * .028, -.158, -.018]], .0025, shadowSkin, hand, 5);
    return { side, upper: segment(.059, .7), forearm: segment(.047, .59), shoulder: ellipsoid([.066, .073, .065], [side * .243, 2.115, .17]), elbow: ellipsoid([.043, .045, .043], [0, 0, 0], skin), hand, fingers };
  });

  const previous = new THREE.Vector3();
  let initialized = false, previousTime = 0, distanceWalked = 0, facing = 0;
  const worldFoot = new THREE.Vector3(), relativeFoot = new THREE.Vector3(), hip = new THREE.Vector3();
  const knee = new THREE.Vector3(), legDirection = new THREE.Vector3(), bend = new THREE.Vector3();
  const shoulder = new THREE.Vector3(), elbow = new THREE.Vector3(), wrist = new THREE.Vector3();
  const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  function pointAt(side, forward, destination) {
    const c = Math.cos(facing), s = Math.sin(facing);
    return destination.set(group.position.x + side * c + forward * s, .063, group.position.z - side * s + forward * c);
  }
  function update(time, { position, target, threat = 0 } = {}) {
    if (!position) { group.visible = false; initialized = false; return; }
    group.visible = true;
    const x = position.x, z = position.z;
    const dx = initialized ? x - previous.x : 0, dz = initialized ? z - previous.z : 0;
    const traveled = Math.hypot(dx, dz);
    const dt = clamp(time - previousTime || 1 / 60, 1 / 240, .07);
    // Teleports/restarts reseed feet; pause and reduced-motion time cannot start a walk cycle.
    if (!initialized || traveled > 2) {
      facing = target ? Math.atan2(target.x - x, target.z - z) : 0;
      group.position.set(x, 0, z); distanceWalked = 0;
      legs.forEach((leg) => { pointAt(leg.side * .147, leg.side < 0 ? .28 : -.2, leg.anchor); leg.desired.copy(leg.anchor); leg.phase = leg.side < 0 ? 0 : .5; });
      initialized = true;
    } else {
      if (traveled > .0002) facing += angleDelta(facing, Math.atan2(dx, dz)) * Math.min(1, dt * 7);
      distanceWalked += traveled;
      group.position.set(x, 0, z);
    }
    group.rotation.y = facing;
    const walking = traveled > .0002 && traveled <= 2;
    const stride = distanceWalked / 1.38;
    const breathe = Math.sin(time * 1.13) * .003;
    anatomy.position.y = breathe;
    torso.scale.z = 1 + Math.sin(time * 1.13) * .008;
    const c = Math.cos(facing), s = Math.sin(facing);
    legs.forEach((leg) => {
      const phase = (stride + (leg.side < 0 ? 0 : .5)) % 1;
      const swing = phase >= .61;
      if (walking && swing) {
        if (leg.phase < .61) leg.swingStart.copy(leg.desired);
        const progress = (phase - .61) / .39;
        pointAt(leg.side * .147, .32, worldFoot);
        leg.desired.lerpVectors(leg.swingStart, worldFoot, smooth(progress));
        leg.desired.y = .063 + Math.sin(progress * Math.PI) * (.115 + threat * .035);
      } else if (walking && !swing) {
        if (leg.phase >= .61) { leg.anchor.copy(leg.desired); leg.anchor.y = .063; }
        leg.desired.copy(leg.anchor);
      }
      // Keep a lifted foot still when the creature stops; it does not moonwalk in place.
      const rx = leg.desired.x - x, rz = leg.desired.z - z;
      relativeFoot.set(rx * c - rz * s, leg.desired.y - breathe, rx * s + rz * c);
      hip.set(leg.side * .137, 1.325, -.04);
      legDirection.subVectors(relativeFoot, hip);
      const reach = clamp(legDirection.length(), .25, 1.343);
      legDirection.normalize();
      relativeFoot.copy(hip).addScaledVector(legDirection, reach);
      const upperLength = .681, lowerLength = .681;
      const along = (upperLength * upperLength - lowerLength * lowerLength + reach * reach) / (2 * reach);
      bend.set(leg.side * .12, 0, 1).addScaledVector(legDirection, -legDirection.dot(new THREE.Vector3(leg.side * .12, 0, 1))).normalize();
      knee.copy(hip).addScaledVector(legDirection, along).addScaledVector(bend, Math.sqrt(Math.max(0, upperLength * upperLength - along * along)));
      placeSegment(leg.upper, hip, knee); placeSegment(leg.lower, knee, relativeFoot); leg.knee.position.copy(knee);
      leg.foot.position.copy(relativeFoot); leg.foot.position.z += .06;
      leg.foot.rotation.x = swing && walking ? -.1 * Math.sin((phase - .61) / .39 * Math.PI) : 0;
      leg.phase = phase;
    });
    arms.forEach((arm) => {
      const gait = Math.sin(stride * TAU + (arm.side < 0 ? 0 : Math.PI));
      shoulder.set(arm.side * .243, 2.112 + (arm.side < 0 ? .035 : -.039), .17);
      elbow.set(arm.side * (.285 + .017 * gait), 1.565, .157 + gait * .09);
      wrist.set(arm.side * (.27 - .024 * gait), .982 + (arm.side < 0 ? -.045 : .012), .17 - gait * (.16 + threat * .05));
      placeSegment(arm.upper, shoulder, elbow); placeSegment(arm.forearm, elbow, wrist);
      arm.shoulder.position.copy(shoulder); arm.elbow.position.copy(elbow); arm.hand.position.copy(wrist);
      arm.hand.rotation.set(-.13 - gait * .16, arm.side * -.17, arm.side * -.075);
      arm.fingers.forEach(({ pivot, base, offset }) => { pivot.rotation.x = base - threat * .13 + Math.sin(time * .64 + offset) * .026; });
    });
    const gaze = target ? clamp(angleDelta(facing, Math.atan2(target.x - x, target.z - z)), -.67, .67) : 0;
    head.rotation.y += (gaze - head.rotation.y) * Math.min(1, dt * 1.55);
    head.rotation.z = -.16 + Math.sin(time * .43) * .012;
    head.rotation.x = -.13 + threat * .045;
    previous.set(x, 0, z); previousTime = time;
  }
  return { group, update };
}

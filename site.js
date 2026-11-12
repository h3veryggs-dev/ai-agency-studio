'use strict';
// Comportamento da página de download: neblina (WebGL), hero com correia de telas que se dissolvem em partículas (canvas 2D), rolagem, download com retorno honesto e cópia do SHA-256.
// Carregado só por site/index.template.html (com defer). Não guarda nada (nem cookie, nem storage) e não fala com nenhum outro servidor.
// Tudo que é efeito tem reserva: sem script, a página fica estática e completa. As animações ficam sempre ligadas.
(function () {
  var root = document.documentElement;
  root.classList.add('js');
  // as animações fazem parte do site: ficam sempre ligadas, mesmo com "reduzir movimento" no sistema (sem botão para desligar)
  var reduce = false; root.classList.add('motion-on');
  var clamp = function (v, a, b) { return Math.max(a === undefined ? 0 : a, Math.min(b === undefined ? 1 : b, v)); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ---------------------------------------------------------------- WebGL: utilidades
  function glOf(canvas, opts) { try { return canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts); } catch (e) { return null; } }
  function program(gl, vsSrc, fsSrc) {
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
    var vs = sh(gl.VERTEX_SHADER, vsSrc), fs = sh(gl.FRAGMENT_SHADER, fsSrc); if (!vs || !fs) return null;
    var p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
  }
  var VS = 'attribute vec2 p; varying vec2 vUv; void main(){ vUv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }';
  function quad(gl, prog) { var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); var loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0); }
  var HP = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';

  // ---------------------------------------------------------------- neblina monocromática com estrelas e granulado (fundo fixo)
  var fogState = { scroll: 0 };
  function initFog() {
    var cv = $('#fog'); if (!cv) return;
    var gl = glOf(cv, { alpha: false, antialias: false, powerPreference: 'low-power' }); if (!gl) return;
    var FS = HP + 'uniform vec2 uRes; uniform float uT; uniform float uScroll; uniform float uGain; varying vec2 vUv;' +
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }' +
      'float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }' +
      'float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(7.1, 3.7); a *= .5; } return v; }' +
      'void main(){' +
      '  vec2 uv = gl_FragCoord.xy / uRes; float asp = uRes.x / uRes.y; vec2 p = vec2(uv.x * asp, uv.y); float t = uT * .018;' +
      '  vec2 q = vec2(fbm(p * 1.1 + vec2(t, -t * .7)), fbm(p * 1.1 + vec2(5.2, 1.3) - vec2(t)));' +
      '  float n = fbm(p * 1.15 + 1.6 * q + vec2(0., uScroll * .35));' +
      '  float cloud = smoothstep(.36, .74, n);' +
      '  float lum = .067 + cloud * .235 * uGain;' +
      '  vec2 g = floor(gl_FragCoord.xy / 6.); float h = hash(g); vec2 c = fract(gl_FragCoord.xy / 6.) - .5;' +
      '  float star = step(.9955, h) * smoothstep(.34, .0, length(c)) * (.55 + .45 * sin(uT * 1.4 + h * 40.));' +
      '  lum += star * .85 * (1. - cloud * .5);' +
      '  lum += (hash(gl_FragCoord.xy + floor(uT * 10.) * 17.) - .5) * .03;' +
      '  float gr = smoothstep(.42, .82, fbm(p * .75 + vec2(-t * .55, t * .35) + 3.1)) * uGain;' + // nuvens verdes bem leves, em outra escala e direção
      '  vec3 col = vec3(lum) * vec3(.9, 1., .94) + vec3(0., .085, .05) * gr;' +
      '  gl_FragColor = vec4(col, 1.);' +
      '}';
    var pr = program(gl, VS, FS); if (!pr) return; gl.useProgram(pr); quad(gl, pr);
    var u = { res: gl.getUniformLocation(pr, 'uRes'), t: gl.getUniformLocation(pr, 'uT'), scroll: gl.getUniformLocation(pr, 'uScroll'), gain: gl.getUniformLocation(pr, 'uGain') };
    var t0 = performance.now(), last = 0, running = false, W = 0, H = 0;
    function size() { var s = .55; W = Math.max(2, Math.round(innerWidth * s)); H = Math.max(2, Math.round(innerHeight * s)); cv.width = W; cv.height = H; gl.viewport(0, 0, W, H); }
    function draw(now) {
      var vh = innerHeight || 800, y = fogState.scroll;
      gl.uniform2f(u.res, W, H); gl.uniform1f(u.t, reduce ? 6 : (now - t0) / 1000);
      gl.uniform1f(u.scroll, y / (vh * 3)); gl.uniform1f(u.gain, 1 - .45 * clamp(y / (vh * .7)));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function loop(now) { if (!running) return; if (now - last > 33) { last = now; draw(now); } requestAnimationFrame(loop); }
    function start() { if (reduce || running || document.hidden) return; running = true; requestAnimationFrame(loop); }
    function stop() { running = false; }
    size(); draw(performance.now());
    root.classList.add('fog-on'); cv.style.background = 'none'; // com a neblina em WebGL, o fundo estático de reserva sai
    window.addEventListener('resize', function () { size(); draw(performance.now()); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
    window.__fogRedraw = function () { if (!running) draw(performance.now()); };
    start();
  }

  // ---------------------------------------------------------------- hero: correia de telas, linha de varredura e dissolução em partículas (canvas 2D)
  // As seis imagens do showcase original (Higgsfield/CloudFront) ficam só neste manifesto e NÃO são carregadas: esta página não faz requisições a terceiros
  // (CSP e promessa de privacidade) e as fotos são de outro produto. As telas usam capturas reais do próprio aplicativo (assets/).
  var BELT_REMOTE_MEDIA = {
    dunes: 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/0e201fcd-ffc0-46a0-bd06-faa07bf0e84b.webp',
    foundry: 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/e80ba08d-d7b6-4b27-b0cd-8d0ad09c788c.webp',
    mineral: 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/2bebad68-8177-446a-9550-d64074166364.webp',
    mesa: 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/62b0d7c1-3eb7-44bd-9b19-57b975fb250f.webp',
    fire: 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/156ff74d-ee37-4443-8f3a-11ae2095ed4c.webp',
    saltflat: 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/7b6ad638-89ec-4dec-be74-d36fbff3ea53.webp'
  };
  function initBelt() {
    var hero = $('.hero'), belt = $('.belt'); if (!hero || !belt) return;
    var cards = $$('.card', belt), codes = $$('.code', belt), cv = $('canvas.fx', belt), g = cv && cv.getContext('2d');
    var N = cards.length; if (!g || N < 2 || codes.length !== N) return;
    var badge = $('.badge', hero), bn = $('.n', badge), bs = $('.s', badge), pill = $('.pill', badge), pauseBtn = $('.belt-pause', hero);
    var STAGES = ['ESPAÇO', 'PLANO', 'AGENTES', 'FERRAMENTAS', 'EXECUÇÃO', 'RESULTADO']; // rótulos da demonstração, não telemetria
    var COL = ['#007A4B', '#009B60', '#00B873', '#00C878', '#38D99A', '#83E9B8', '#D2F9E5'], TOP = 70, G = 3;
    var W = 0, H = 0, cw = 0, ch = 0, gap = 0, span = 0, period = 0, Lx = 0, rad = 0, dpr = 1, ready = false;
    var off = 0, vel = 0, hover = 0, hovering = false, paused = false, dragging = false, dragVel = 0, lead = 0, lx = 0, lt = 0;
    var xs = [], cuts = [], cur = -1, sparks = [], lastOff = NaN, raf = 0, lastT = 0, inView = true, buckets = [];
    for (var q = 0; q < N; q++) { xs.push(0); cuts.push(0); }
    for (var z = 0; z < COL.length; z++) buckets.push([]);
    function mod(a, n) { return ((a % n) + n) % n; }
    function len(v) { v = String(v).trim(); var n = parseFloat(v); if (/vw$/.test(v)) return n * innerWidth / 100; if (/vh$/.test(v)) return n * innerHeight / 100; return n; }
    function hash(a, b, c) { var h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
    function measure() { // só ao carregar e ao redimensionar: nada de medir dentro do quadro
      var r = cards[0].getBoundingClientRect(), b = belt.getBoundingClientRect(), phase = ready && span ? off / span : null;
      cw = r.width; ch = r.height; W = b.width; H = b.height; Lx = W / 2; gap = len(getComputedStyle(belt).getPropertyValue('--gap'));
      rad = parseFloat(getComputedStyle(cards[0]).borderTopLeftRadius) || 0; span = cw + gap; period = span * N; dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      off = phase !== null ? phase * span : (reduce ? Lx - cw / 2 : W / 2 - .62 * cw);
      ready = true; lastOff = NaN;
    }
    function layout() { // posiciona cada cartão e seu gêmeo de texto só com transform; o corte do cartão e a revelação do texto compartilham o mesmo cut
      var now = -1;
      for (var i = 0; i < N; i++) {
        var x = mod(off + i * span + span, period) - span, cut = Math.max(0, Math.min(cw, Lx - x)), c = cards[i], k = codes[i], tr = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
        xs[i] = x; cuts[i] = cut; c.style.transform = tr; k.style.transform = tr;
        if (cut > 0) {
          var cs = cut.toFixed(1);
          c.style.clipPath = 'inset(0 0 0 ' + cs + 'px round 0 ' + rad + 'px ' + rad + 'px 0)';
          c.style.webkitMaskImage = c.style.maskImage = 'linear-gradient(90deg, transparent ' + cs + 'px, #000 ' + (cut + 26).toFixed(1) + 'px)';
          c.style.visibility = cut >= cw - .5 ? 'hidden' : 'visible';
          k.style.visibility = 'visible'; k.style.clipPath = 'inset(0 ' + (cw - cut).toFixed(1) + 'px 0 0)';
          if (cut < cw) now = i;
        } else { c.style.clipPath = ''; c.style.webkitMaskImage = c.style.maskImage = ''; c.style.visibility = 'visible'; k.style.visibility = 'hidden'; k.style.clipPath = ''; }
      }
      if (now !== -1 && now !== cur) {
        cur = now; bn.textContent = ('0' + (now + 1)).slice(-2) + ' / 0' + N; bs.textContent = STAGES[now % STAGES.length];
        if (!reduce && pill.animate) pill.animate([{ opacity: .45, transform: 'translateY(2px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }
    function drawFx(t, dt) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      var tw = reduce ? 0 : Math.floor(t * 9), crossing = false, i, b, k, m;
      for (i = 0; i < N; i++) {
        var cut = cuts[i], x = xs[i]; if (cut <= 0 || x + cw <= Lx) continue; crossing = true;
        var hw = Math.min(150, x + cw - Lx); // 1) névoa que sai da linha
        if (hw > 0) { var gr = g.createLinearGradient(Lx, 0, Lx + 150, 0); gr.addColorStop(0, 'rgba(0,200,120,.32)'); gr.addColorStop(1, 'rgba(0,200,120,0)'); g.fillStyle = gr; g.fillRect(Lx, TOP, hw, ch); }
        // 2) pontos tramados presos à superfície do cartão (grade de 3 px em coordenadas do cartão), densos na linha e some a 30% da largura
        var R = .3 * cw, rows = Math.ceil(ch / G), gx0 = Math.ceil(cut / G), gx1 = Math.floor((cut + R) / G);
        for (b = 0; b < COL.length; b++) buckets[b].length = 0;
        for (var gx = gx0; gx <= gx1; gx++) {
          var sx = x + gx * G, d = sx - Lx; if (d < 0 || d >= R) continue;
          var p = Math.pow(1 - d / R, 1.7);
          for (var row = -5; row < rows + 5; row++) {
            var pr = row >= 0 && row < rows ? p * .92 : p * .16 * Math.max(0, 1 - (row < 0 ? -row : row - rows + 1) / 5);
            if (hash(gx, row, i) >= pr) continue;
            if (!reduce && hash(gx, row, tw + 97) < .22) continue; // cintilar: ~1/5 dos pontos pisca 9 vezes por segundo
            var h2 = hash(row, gx, i + 31), s = 1.1 + h2 * 1.7, jx = 0, jy = 0;
            k = d < 10 ? 4 + Math.floor(h2 * 3) : Math.floor(h2 * h2 * 7);
            if (!reduce) { jx = (hash(gx, row, tw + 5 + i) - .5) * 1.6; jy = (hash(row, gx, tw + 11 + i) - .5) * 1.6; }
            buckets[k].push(sx + jx - s / 2, TOP + row * G + jy - s / 2, s);
          }
        }
        for (k = 0; k < COL.length; k++) { var bk = buckets[k]; if (!bk.length) continue; g.fillStyle = COL[k]; for (m = 0; m < bk.length; m += 3) g.fillRect(bk[m], bk[m + 1], bk[m + 2], bk[m + 2]); }
      }
      // 3) faíscas livres: até 3 tentativas por quadro (a 60 quadros/s), 70% de chance cada, perto da linha
      if (!reduce && crossing) for (var a = Math.max(1, Math.round(3 * dt * 60)); a > 0; a--) if (Math.random() < .7 && sparks.length < 160) sparks.push({ x: Lx + Math.random() * 30, y: TOP - 10 + Math.random() * (ch + 20), vx: -30 + Math.random() * 70 + .6 * vel, vy: (Math.random() - .5) * 50, s: .8 + Math.random() * 1.8, c: COL[(Math.random() * COL.length) | 0], life: .3 + Math.random() * .8 });
      for (i = sparks.length - 1; i >= 0; i--) {
        var sp = sparks[i]; sp.life -= dt; if (sp.life <= 0) { sparks.splice(i, 1); continue; }
        sp.x += sp.vx * dt; sp.y += sp.vy * dt; g.globalAlpha = Math.min(1, sp.life * 2.2); g.fillStyle = sp.c; g.fillRect(sp.x - sp.s / 2, sp.y - sp.s / 2, sp.s, sp.s);
      }
      g.globalAlpha = 1;
    }
    function step(dt, t) {
      var auto = (reduce || paused) ? 0 : -.075 * innerWidth;
      var vmax = .1 * innerWidth;
      if (dragging || lead) { // arrastar e a roda horizontal funcionam como a rolagem: a correia vai até onde o ponteiro mandou, com suavidade e velocidade máxima
        // velocidade desejada proporcional ao que falta (freia sozinha ao chegar), limitada a 80% da largura por segundo; e a velocidade só muda aos poucos (aceleração máxima), então nunca arranca nem freia de repente
        var want = Math.max(-.8 * innerWidth, Math.min(.8 * innerWidth, lead * 6)), acc = 2.5 * innerWidth * dt;
        vel += Math.max(-acc, Math.min(acc, want - vel)); var mv = vel * dt; if (!dragging && Math.abs(mv) > Math.abs(lead)) mv = lead;
        off += mv; lead -= mv; if (!dragging && Math.abs(lead) < .5 && Math.abs(vel) <= vmax) { off += lead; lead = 0; }
      } else {
        hover = Math.max(0, Math.min(1, hover + (hovering ? 1 : -1) * 4 * dt));
        vel += (auto * (1 - .45 * hover) - vel) * (1 - Math.exp(-1.2 * dt)); // muda de ritmo devagar: sem arrancadas nem freadas bruscas
        vel = Math.max(-vmax, Math.min(vmax, vel)); // limite: mesmo jogada ou girando a roda, a correia passa no máximo a 10% da largura por segundo (a normal é 7,5%)
        off += vel * dt;
      }
      var moved = off !== lastOff, cross = false; lastOff = off; if (moved) layout();
      for (var i = 0; i < N; i++) if (cuts[i] > 0 && xs[i] + cw > Lx) cross = true;
      if (moved || sparks.length || (cross && !reduce)) drawFx(t, dt);
    }
    function frame(now) { raf = 0; if (!inView || document.hidden) { lastT = 0; return; } var dt = lastT ? Math.min(.05, (now - lastT) / 1000) : 1 / 60; lastT = now; step(dt, now / 1000); raf = requestAnimationFrame(frame); }
    function kick() { if (!raf && inView && !document.hidden) raf = requestAnimationFrame(frame); }
    belt.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') hovering = true; });
    belt.addEventListener('pointerleave', function () { hovering = false; });
    belt.addEventListener('pointerdown', function (e) { if (e.button > 0) return; dragging = true; lx = e.clientX; lt = e.timeStamp; dragVel = vel; belt.classList.add('drag'); try { belt.setPointerCapture(e.pointerId); } catch (x) { /* sem captura: o arrasto segue enquanto o ponteiro estiver sobre a correia */ } });
    belt.addEventListener('pointermove', function (e) { if (!dragging) return; var dx = e.clientX - lx; if (reduce) { off += dx; kick(); } else lead = Math.max(-innerWidth, Math.min(innerWidth, lead + dx)); lx = e.clientX; lt = e.timeStamp; });
    function release(e) { if (!dragging) return; dragging = false; belt.classList.remove('drag'); }
    belt.addEventListener('pointerup', release); belt.addEventListener('pointercancel', release);
    belt.addEventListener('wheel', function (e) { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { if (reduce) off -= e.deltaX; else lead = Math.max(-innerWidth, Math.min(innerWidth, lead - e.deltaX)); e.preventDefault(); kick(); } }, { passive: false });
    if (pauseBtn) pauseBtn.addEventListener('click', function () { paused = !paused; pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false'); pauseBtn.textContent = paused ? 'Retomar animação' : 'Pausar animação'; });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { inView = es[0].isIntersecting; if (inView) kick(); }, { threshold: 0 }).observe(hero);
    document.addEventListener('visibilitychange', kick);
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { measure(); kick(); }, 120); });
    window.addEventListener('load', function () { measure(); kick(); });
    window.addEventListener('pagehide', function () { inView = false; if (raf) cancelAnimationFrame(raf); raf = 0; });
    window.addEventListener('pageshow', function (e) { if (e.persisted) { inView = true; kick(); } });
    window.__belt = { state: function () { return { off: off, vel: vel, hover: hover, cw: cw, ch: ch, gap: gap, Lx: Lx, cuts: cuts.slice(), idx: cur, sparks: sparks.length, paused: paused }; }, setOff: function (v) { off = v; vel = 0; } }; // gancho lido pelo teste (test/site-hero.js)
    measure(); kick();
  }

  // ---------------------------------------------------------------- veja por dentro: a rolagem conduz a câmera pela interface real (cena fixa, como um vídeo)
  // Sem script ou com movimento reduzido, a seção fica estática (janela + legenda). Mede só ao carregar e ao redimensionar; a cada quadro só escreve transform/opacity.
  function initScrolly() {
    var st = $('.scrolly'); if (!st || reduce) return;
    var cam = $('.cam', st), apr = $('.apr', st), sbar = $('.sbar', st), caps = $$('.cap .c', st), rail = $$('.rail [data-n]', st), hls = $$('.hl', st);
    if (!cam || !apr || !sbar || caps.length !== 4 || rail.length !== 4 || hls.length !== 3) return;
    st.classList.add('on');
    // quadros-chave: z = zoom, cx/cy = ponto da janela no centro da tela, ry = deslocamento vertical inicial (fração da altura), wo = janela, ao = aprovação, h = realces
    var K = [{ p: 0, z: .58, cx: .5, cy: .5, ry: .34, wo: 1, ao: 0, h: [0, 0, 0] }, { p: .14, z: 1, cx: .5, cy: .5, ry: 0, wo: 1, ao: 0, h: [0, 0, 0] },
      { p: .26, z: 1.9, cx: .6, cy: .235, ry: 0, wo: 1, ao: 0, h: [1, 0, 0] }, { p: .4, z: 1.45, cx: .6, cy: .46, ry: 0, wo: 1, ao: 0, h: [0, 1, 0] }, { p: .52, z: 1.45, cx: .6, cy: .46, ry: 0, wo: 1, ao: 0, h: [0, 1, 0] },
      { p: .6, z: .9, cx: .5, cy: .5, ry: 0, wo: .3, ao: 1, h: [0, 0, 0] }, { p: .74, z: .9, cx: .5, cy: .5, ry: 0, wo: .3, ao: 1, h: [0, 0, 0] },
      { p: .82, z: 1.6, cx: .6, cy: .78, ry: 0, wo: 1, ao: 0, h: [0, 0, 1] }, { p: .94, z: 1.6, cx: .6, cy: .78, ry: 0, wo: 1, ao: 0, h: [0, 0, 1] }, { p: 1, z: 1, cx: .5, cy: .5, ry: 0, wo: 1, ao: 0, h: [0, 0, 0] }];
    var cur = 0, vel = 0, target = 0, raf = 0, last = 0, step = 0, top = 0, range = 1, fac = 1, W = 0, H = 0, vh = 1;
    function sm(t) { return t * t * (3 - 2 * t); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function measure() { var r = st.getBoundingClientRect(); vh = window.innerHeight || 800; top = r.top + window.pageYOffset; range = Math.max(1, st.offsetHeight - vh); fac = Math.min(1100, .92 * window.innerWidth) / cam.offsetWidth; W = cam.offsetWidth * fac; H = cam.offsetHeight * fac; }
    function render(p) {
      var i = 0; while (i < K.length - 2 && p > K[i + 1].p) i++;
      var a = K[i], b = K[i + 1], e = sm(clamp((p - a.p) / (b.p - a.p))), z = lerp(a.z, b.z, e), ao = lerp(a.ao, b.ao, e);
      var tx = (.5 - lerp(a.cx, b.cx, e)) * W * z, ty = (.5 - lerp(a.cy, b.cy, e)) * H * z + lerp(a.ry, b.ry, e) * vh;
      cam.style.transform = 'translate3d(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px,0) scale(' + (z * fac).toFixed(4) + ')';
      cam.style.opacity = lerp(a.wo, b.wo, e).toFixed(3);
      apr.style.opacity = ao.toFixed(3); apr.style.transform = 'translate3d(0,' + ((1 - ao) * 48).toFixed(1) + 'px,0) scale(' + (.94 + .06 * ao).toFixed(4) + ')';
      for (var h = 0; h < 3; h++) hls[h].style.opacity = lerp(a.h[h], b.h[h], e).toFixed(3);
      sbar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
      var s = p < .28 ? 1 : p < .52 ? 2 : p < .76 ? 3 : 4;
      if (s !== step) { step = s; for (var k = 0; k < 4; k++) { caps[k].classList.toggle('on', k === s - 1); rail[k].classList.toggle('on', k === s - 1); } }
    }
    function frame(t) { // a imagem segue a rolagem com um pouco de inércia (constante de tempo de 110 ms), sem depender da taxa de quadros
      raf = 0; var dt = last ? Math.min(64, t - last) : 16; last = t;
      for (var h = dt / 1000; h > 1e-6; h -= .016) { var q = Math.min(.016, h); vel += (144 * (target - cur) - 24 * vel) * q; cur += vel * q; } // mola contínua (sem botes a cada tique)
      if (Math.abs(target - cur) < .0004 && Math.abs(vel) < .002) { cur = target; vel = 0; }
      render(cur); if (cur !== target) raf = requestAnimationFrame(frame); else last = 0;
    }
    function onScroll() { target = clamp((window.pageYOffset - top) / range); if (!raf) raf = requestAnimationFrame(frame); }
    function init() { measure(); target = clamp((window.pageYOffset - top) / range); cur = target; render(cur); }
    window.addEventListener('scroll', onScroll, { passive: true });
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { measure(); onScroll(); }, 120); });
    window.addEventListener('load', init);
    document.addEventListener('visibilitychange', function () { last = 0; });
    window.__scrolly = { get p() { return cur; } }; // lido pelo teste (test/site-motion.js)
    init();
  }

  // ---------------------------------------------------------------- onda: títulos palavra a palavra, atraso de entrada por linha e coluna, ondulação com a rolagem e linhas de onda
  $$('.legend li').forEach(function (el) { el.classList.add('reveal'); });
  $$('.sec-head h2').forEach(function (h) {
    var n = 0;
    (function split(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var s = document.createElement('span'); s.className = 'ww'; s.textContent = part; s.style.setProperty('--i', n++); frag.appendChild(s);
          });
          node.replaceChild(frag, c);
        } else if (c.nodeType === 1) split(c);
      });
    })(h);
  });
  (function waveDelays() { // diagonal com uma leve ondulação: quem está mais à direita e mais abaixo entra depois
    var groups = [];
    $$('.reveal').forEach(function (el) { var g = null; for (var i = 0; i < groups.length; i++) if (groups[i].p === el.parentNode) g = groups[i]; if (!g) { g = { p: el.parentNode, els: [] }; groups.push(g); } g.els.push(el); });
    function ranks(vals) { var u = []; vals.slice().sort(function (a, b) { return a - b; }).forEach(function (v) { if (!u.length || v - u[u.length - 1] > 4) u.push(v); }); return function (v) { for (var i = u.length - 1; i >= 0; i--) if (v >= u[i] - 4) return i; return 0; }; }
    groups.forEach(function (g) {
      if (g.els.length < 2) return;
      var rs = g.els.map(function (e) { return e.getBoundingClientRect(); }), col = ranks(rs.map(function (r) { return r.left; })), row = ranks(rs.map(function (r) { return r.top; }));
      g.els.forEach(function (e, i) { var c = col(rs[i].left), r = row(rs[i].top); e.style.setProperty('--d', Math.max(0, c * .09 + r * .13 + .05 * Math.sin(c * 1.9 + r * 1.3) + .02 * i).toFixed(3) + 's'); });
    });
  })();
  function initWave() {
    var lines = $$('.wave-line').map(function (w, k) { var ps = w.querySelectorAll('path'); return { el: w, a: ps[0], b: ps[1], k: k * 1.3, on: false }; }).filter(function (l) { return l.a && l.b; });
    function lineD(ph, A1, A2, k) { var s = ''; for (var j = 0; j <= 48; j++) { var x = j * 30, y = 60 + A1 * Math.sin(x * .0044 + ph + k) + A2 * Math.sin(x * .0115 - ph * 1.7 + k * 2); s += (j ? ' L' : 'M') + x + ' ' + y.toFixed(1); } return s; }
    function drawLine(l, ph, amp) { l.a.setAttribute('d', lineD(ph, 9 + amp * 1.6, 3.5 + amp * .7, l.k)); l.b.setAttribute('d', lineD(ph * .8 + 1.1, (9 + amp * 1.6) * .6, (3.5 + amp * .7) * 1.4, l.k + .7)); }
    if (reduce) { lines.forEach(function (l) { drawLine(l, 0, 0); }); return; } // movimento reduzido: linhas paradas e sem ondulação
    var rip = $$('.step, .fact, .legend li, .req-list > div, .tile').map(function (el) { return { el: el, x: 0, y: 0, on: false, last: 0 }; });
    var raf = 0, lastT = 0, lastY = window.pageYOffset, vv = 0, amp = 0;
    function measure() { var sy = window.pageYOffset; rip.forEach(function (r) { var b = r.el.getBoundingClientRect(); r.x = b.left + b.width / 2; r.y = b.top + sy + b.height / 2; }); }
    function frame(t) {
      raf = 0; var dt = lastT ? Math.min(64, t - lastT) : 16; lastT = t;
      var sy = window.pageYOffset, v = (sy - lastY) / dt; lastY = sy; // velocidade da rolagem em px/ms, suavizada
      vv += (v - vv) * (1 - Math.exp(-dt / 90));
      amp += (Math.min(24, Math.abs(vv) * 10) - amp) * (1 - Math.exp(-dt / 110));
      var ph = sy * .006 + t * .0012, dir = vv < 0 ? -1 : 1, idle = amp < .04 && Math.abs(vv) < .01;
      for (var i = 0; i < rip.length; i++) {
        var r = rip[i], ty = idle || !r.on ? 0 : amp * dir * Math.sin(ph + r.x * .0065 + r.y * .0018);
        if (Math.abs(ty - r.last) > .05 || (ty === 0 && r.last !== 0)) { r.el.style.setProperty('--wy', ty.toFixed(2) + 'px'); r.last = ty; }
      }
      var any = false; for (var j = 0; j < lines.length; j++) if (lines[j].on) { any = true; drawLine(lines[j], t * .0011 + sy * .004, amp); }
      if (!idle || any) raf = requestAnimationFrame(frame); else { lastT = 0; }
    }
    function kick() { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); }
    if ('IntersectionObserver' in window) {
      var io2 = new IntersectionObserver(function (es) { es.forEach(function (e) { var o = e.target.__wave; if (o) o.on = e.isIntersecting; }); kick(); }, { rootMargin: '10% 0px' });
      rip.forEach(function (r) { r.el.__wave = r; io2.observe(r.el); }); lines.forEach(function (l) { l.el.__wave = l; io2.observe(l.el); });
    } else { rip.forEach(function (r) { r.on = true; }); lines.forEach(function (l) { l.on = true; }); }
    lines.forEach(function (l) { drawLine(l, 0, 0); });
    window.addEventListener('scroll', kick, { passive: true });
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(measure, 150); });
    window.addEventListener('load', measure);
    document.addEventListener('visibilitychange', function () { lastT = 0; kick(); });
    measure(); kick();
  }

  // ---------------------------------------------------------------- entrada das seções
  var items = $$('.reveal');
  if (reduce || !('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  }

  // ---------------------------------------------------------------- efeitos ligados à rolagem (variáveis CSS e classes; nada escrito no HTML)
  var nav = $('.nav'), bar = $('.progress'), shot = $('.shot'), statement = $('.statement');
  var links = $$('.nav nav a[href^="#"]'), tiles = $$('[data-par]');
  var words = [];
  (function split(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (c) {
      if (c.nodeType === 3) {
        var frag = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          var s = document.createElement('span'); s.className = 'w'; s.textContent = part; frag.appendChild(s); words.push(s);
        });
        node.replaceChild(frag, c);
      } else if (c.nodeType === 1) split(c);
    });
  })(statement || document.createElement('div'));

  var ticking = false;
  function frameScroll() {
    ticking = false;
    var vh = window.innerHeight || 800, y = window.pageYOffset || 0, max = Math.max(1, root.scrollHeight - vh);
    fogState.scroll = y; if (window.__fogRedraw) window.__fogRedraw();
    if (bar) bar.style.setProperty('--p', clamp(y / max).toFixed(4)); // só na própria barra: variável no <html> recalcularia o estilo da página inteira
    if (nav) nav.classList.toggle('scrolled', y > 8);
    if (shot) {
      var r = shot.getBoundingClientRect();
      shot.style.setProperty('--t', (reduce ? 1 : clamp((vh - r.top) / (vh * 0.85))).toFixed(3));
      if (r.top < vh * 0.88) shot.classList.add('lit');
    }
    if (statement && words.length) {
      var s = statement.getBoundingClientRect(), p = reduce ? 1 : clamp((vh * 0.85 - s.top) / ((vh * 0.4) + s.height)), n = Math.round(p * words.length);
      for (var i = 0; i < words.length; i++) words[i].classList.toggle('on', i < n);
    }
    if (!reduce && innerWidth > 960) tiles.forEach(function (t) {
      var r = t.getBoundingClientRect(), c = (r.top + r.height / 2 - vh / 2) / vh;
      t.style.setProperty('--py', (parseFloat(t.getAttribute('data-par')) * clamp(c, -1, 1)).toFixed(1) + 'px');
    });
  }
  function request() { if (!ticking) { ticking = true; window.requestAnimationFrame(frameScroll); } }
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);
  frameScroll();

  if ('IntersectionObserver' in window && links.length) {
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var a = byId[e.target.id]; if (!a) return;
        if (e.isIntersecting) { links.forEach(function (l) { l.removeAttribute('aria-current'); }); a.setAttribute('aria-current', 'true'); }
        else a.removeAttribute('aria-current');
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    Object.keys(byId).forEach(function (id) { var sec = document.getElementById(id); if (sec) spy.observe(sec); });
  }

  // luz que segue o ponteiro nas células de recursos (só com mouse)
  if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
    $$('.tile').forEach(function (t) {
      t.addEventListener('pointermove', function (e) {
        var b = t.getBoundingClientRect();
        t.style.setProperty('--mx', (e.clientX - b.left).toFixed(0) + 'px');
        t.style.setProperty('--my', (e.clientY - b.top).toFixed(0) + 'px');
      }, { passive: true });
    });
  }

  // ---------------------------------------------------------------- download e cópia do hash
  function setStatus(el, state, text) {
    if (!el) return;
    if (state) el.setAttribute('data-state', state); else el.removeAttribute('data-state');
    el.textContent = text;
  }
  // Na mesma origem, confere se o arquivo existe antes (HEAD) para avisar a falha em vez de abrir uma página de erro.
  // Em outra origem (Release do GitHub), o navegador baixa direto e a página só confirma o pedido, com um link de reserva.
  $$('[data-download]').forEach(function (btn) {
    btn.addEventListener('click', function (ev) {
      var group = btn.closest('[data-download-group]'), status = group && $('[data-download-status]', group), url;
      try { url = new URL(btn.getAttribute('href'), location.href); } catch (e) { return; }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      if (url.origin !== location.origin) {
        setStatus(status, 'ok', 'Download pedido ao navegador. Se não começar, ');
        var a = document.createElement('a'); a.href = url.href; a.textContent = 'baixe por este link'; a.rel = 'noopener';
        status.appendChild(a); status.appendChild(document.createTextNode('.'));
        return;
      }
      ev.preventDefault();
      if (btn.getAttribute('aria-busy') === 'true') return;
      btn.setAttribute('aria-busy', 'true');
      setStatus(status, '', 'Preparando o download…');
      fetch(url.href, { method: 'HEAD', cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var tmp = document.createElement('a');
        tmp.href = url.href; tmp.download = btn.getAttribute('download') || '';
        tmp.hidden = true; document.body.appendChild(tmp); tmp.click(); tmp.remove();
        setStatus(status, 'ok', 'Download iniciado pelo navegador. Confira a barra ou a pasta de downloads.');
      }).catch(function () {
        setStatus(status, 'erro', 'O instalador não está disponível agora. Tente de novo em alguns minutos.');
      }).then(function () { btn.removeAttribute('aria-busy'); });
    });
  });
  $$('[data-copy-sha]').forEach(function (b) {
    var timer;
    b.addEventListener('click', function () {
      var code = $('[data-sha]', b.parentNode), sha = code ? code.textContent.trim() : '';
      if (!/^[0-9a-f]{64}$/.test(sha)) return; // modelo sem dados: não há hash para copiar
      if (!navigator.clipboard) { b.textContent = 'Selecione e copie'; return; }
      navigator.clipboard.writeText(sha).then(function () {
        b.textContent = 'Copiado'; b.setAttribute('data-done', '');
        clearTimeout(timer);
        timer = setTimeout(function () { b.textContent = 'Copiar'; b.removeAttribute('data-done'); }, 2000);
      }, function () { b.textContent = 'Selecione e copie'; });
    });
  });

  // efeitos em WebGL por último: se algo falhar neles, o resto da página já está funcionando
  try { initFog(); } catch (e) { /* sem neblina: fica o fundo estático */ }
  try { initWave(); } catch (e) { /* sem onda: tudo continua visível e parado */ }
  try { initScrolly(); } catch (e) { /* sem a cena: a janela e a legenda ficam estáticas */ }
  try { initBelt(); } catch (e) { /* sem a correia: as telas ficam paradas e o texto do hero continua completo */ }
})();

// ---------------------------------------------------------------- cursor: ponto preciso e um anel que o segue com leve atraso. Sobre links e botões o anel abraça o botão
// (magnético) e o botão acompanha um pouco o ponteiro. Só com mouse; some no toque e com movimento reduzido; em campos de texto volta o cursor normal.
(function () {
  var mm = window.matchMedia ? function (q) { return window.matchMedia(q).matches; } : function () { return false; };
  if (!mm('(hover: hover) and (pointer: fine)')) return;
  var root = document.documentElement, dot = document.createElement('div'), ring = document.createElement('div');
  dot.className = 'cur-dot'; ring.className = 'cur-ring'; dot.setAttribute('aria-hidden', 'true'); ring.setAttribute('aria-hidden', 'true');
  document.body.appendChild(dot); document.body.appendChild(ring); root.classList.add('has-cursor');
  var SEL = 'a, button, [role="button"], summary, select', TEXT = 'input, textarea, [contenteditable="true"]';
  var x = -100, y = -100, rx = x, ry = y, rw = 34, rh = 34, rr = 17, tx = x, ty = y, tw = 34, th = 34, tr = 17, mag = null, raf = 0, last = 0, seen = false;
  function setMag(el) { if (mag === el) return; if (mag) mag.style.translate = ''; mag = el; root.classList.toggle('cur-hover', !!el); }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0; var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;
    if (mag && mag.isConnected) {
      var r = mag.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, br = parseFloat(getComputedStyle(mag).borderTopLeftRadius) || 8;
      var dx = Math.max(-8, Math.min(8, (x - cx) * 0.18)), dy = Math.max(-5, Math.min(5, (y - cy) * 0.25));
      mag.style.translate = dx.toFixed(1) + 'px ' + dy.toFixed(1) + 'px';
      tx = cx + dx; ty = cy + dy; tw = r.width + 10; th = r.height + 10; tr = Math.min(br + 5, th / 2);
    } else { tx = x; ty = y; tw = th = 34; tr = 17; }
    var k = 1 - Math.exp(-dt * 18); rx += (tx - rx) * k; ry += (ty - ry) * k; rw += (tw - rw) * k; rh += (th - rh) * k; rr += (tr - rr) * k;
    dot.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    ring.style.transform = 'translate3d(' + (rx - rw / 2).toFixed(1) + 'px,' + (ry - rh / 2).toFixed(1) + 'px,0)';
    ring.style.width = rw.toFixed(1) + 'px'; ring.style.height = rh.toFixed(1) + 'px'; ring.style.borderRadius = rr.toFixed(1) + 'px';
    if (Math.abs(tx - rx) > 0.2 || Math.abs(ty - ry) > 0.2 || Math.abs(tw - rw) > 0.2 || Math.abs(th - rh) > 0.2) raf = requestAnimationFrame(frame); else last = 0; // parado quando o ponteiro para
  }
  document.addEventListener('mousemove', function (e) {
    x = e.clientX; y = e.clientY; if (!seen) { seen = true; rx = x; ry = y; root.classList.add('cur-on'); }
    var t = e.target, txt = t.closest ? t.closest(TEXT) : null; root.classList.toggle('cur-text', !!txt);
    setMag(!txt && t.closest ? t.closest(SEL) : null); kick();
  }, { passive: true });
  document.addEventListener('scroll', kick, { passive: true }); // o botão sob o ponteiro muda de lugar com a rolagem
  document.documentElement.addEventListener('mouseleave', function () { root.classList.remove('cur-on'); seen = false; setMag(null); });
  document.addEventListener('mousedown', function () { root.classList.add('cur-down'); });
  document.addEventListener('mouseup', function () { root.classList.remove('cur-down'); });
})();

// ---------------------------------------------------------------- rolagem suave da roda: com as animações do Windows desligadas o Chrome rola a roda aos saltos
// (100 px de uma vez a cada tique), e a página parece travar. Aqui cada tique continua andando a mesma distância, só que deslizando. Só a roda vertical do mouse:
// teclado, barra de rolagem, links internos, toque e a roda horizontal (que a correia usa) seguem nativos. Desliga com movimento reduzido (sem o botão).
(function () {
  var mm = window.matchMedia ? function (q) { return window.matchMedia(q).matches; } : function () { return false; };
  if (!mm('(hover: hover) and (pointer: fine)')) return;
  var target = window.pageYOffset, cur = target, raf = 0, last = 0, own = false;
  var maxY = function () { return Math.max(0, document.documentElement.scrollHeight - window.innerHeight); };
  function scrollsInside(el, d) { // um elemento com rolagem própria no caminho rola nativo
    for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      var s = getComputedStyle(el); if (!/(auto|scroll)/.test(s.overflowY) || el.scrollHeight <= el.clientHeight + 1) continue;
      if ((d > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) || (d < 0 && el.scrollTop > 0)) return true;
    }
    return false;
  }
  function step(now) {
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;
    // limite de velocidade: no máximo 1,4 tela por segundo, e 0,8 enquanto o "Veja por dentro" está na tela, para dar tempo de ver cada etapa
    var vh = window.innerHeight, sc = document.querySelector('.scrolly'), r = sc && sc.getBoundingClientRect(), vmax = (r && r.top < vh && r.bottom > 0 ? 0.8 : 1.4) * vh * dt;
    var mv = (target - cur) * (1 - Math.exp(-dt * 11)); cur += Math.max(-vmax, Math.min(vmax, mv)); if (Math.abs(target - cur) < 0.4) cur = target;
    own = true; window.scrollTo({ top: cur, behavior: 'instant' }); own = false;
    if (cur !== target) raf = requestAnimationFrame(step); else { raf = 0; last = 0; }
  }
  window.addEventListener('wheel', function (e) {
    if (e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // zoom e roda horizontal ficam com o navegador
    var d = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? window.innerHeight : 1); if (!d || scrollsInside(e.target, d)) return;
    if (!raf) target = cur = window.pageYOffset;
    target = Math.max(0, Math.min(maxY(), Math.max(cur - window.innerHeight, Math.min(cur + window.innerHeight, target + d)))); e.preventDefault(); // a roda acumula no máximo uma tela à frente: parou de girar, para logo
    if (!raf) raf = requestAnimationFrame(step);
  }, { passive: false });
  window.addEventListener('scroll', function () { if (!own && !raf) target = cur = window.pageYOffset; }, { passive: true }); // teclado, barra e links mudam a posição: acompanha
})();

// Liquid Glass dos botões de baixar: o reflexo e o aro de luz seguem o ponteiro (só variáveis CSS, uma vez por quadro; sem mexer no layout)
(() => {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  for (const b of document.querySelectorAll('.btn-primary, .nav-cta')) {
    let raf = 0, ev = null;
    const paint = () => { raf = 0; const r = b.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
      b.style.setProperty('--lx', (x * 100).toFixed(1) + '%'); b.style.setProperty('--ly', (y * 100).toFixed(1) + '%');
      b.style.setProperty('--la', (Math.atan2((y - 0.5) * r.height, (x - 0.5) * r.width) * 180 / Math.PI + 90).toFixed(1) + 'deg'); };
    b.addEventListener('pointermove', e => { ev = e; if (!raf) raf = requestAnimationFrame(paint); });
    b.addEventListener('pointerleave', () => { if (raf) cancelAnimationFrame(raf); raf = 0; for (const k of ['--lx', '--ly', '--la']) b.style.removeProperty(k); });
  }
})();

// Cartório escuro: carimbo do painel de download bate ao entrar na tela, títulos entram palavra por palavra e o papel de segurança sobe com a rolagem.
(() => {
  const root = document.documentElement;
  const stamp = document.querySelector('.stamp-dl');
  if (stamp && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { stamp.classList.add('hit'); io.disconnect(); } }, { threshold: .55 });
    io.observe(document.querySelector('.dl-panel') || stamp);
  } else if (stamp) stamp.classList.add('hit');
  let raf = 0;
  const paint = () => { raf = 0; root.style.setProperty('--gy', Math.min(640, scrollY * .07).toFixed(1)); };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(paint); }, { passive: true });
})();

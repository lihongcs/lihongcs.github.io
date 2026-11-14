(() => {
    const vertexSource = `
        attribute vec3 aPosition;
        attribute vec2 aTileUV;
        attribute vec2 aTileIndex;
        uniform vec2 uSpin;
        varying vec2 vTileUV;
        varying vec2 vTileIndex;
        varying float vDepth;

        void main() {
            float x = aPosition.x * uSpin.x + aPosition.z * uSpin.y;
            float z = aPosition.z * uSpin.x - aPosition.x * uSpin.y;
            // Tilt the polar axis 16 degrees toward the viewer.
            float y = aPosition.y * 0.9613 - z * 0.2756;
            z = aPosition.y * 0.2756 + z * 0.9613;
            gl_Position = vec4(0.96 * x, 0.96 * y, -0.96 * z, 1.0);
            vTileUV = aTileUV;
            vTileIndex = aTileIndex;
            vDepth = z;
        }
    `;
    const fragmentSource = `
        precision mediump float;
        uniform sampler2D uAtlas;
        uniform vec2 uGrid;
        varying vec2 vTileUV;
        varying vec2 vTileIndex;
        varying float vDepth;

        void main() {
            vec2 edge = abs(vTileUV - 0.5) - 0.40;
            float distance = length(max(edge, 0.0)) + min(max(edge.x, edge.y), 0.0) - 0.078;
            float fill = 1.0 - smoothstep(-0.014, 0.014, distance);
            vec2 atlasUV = (vTileIndex + clamp(vTileUV, 0.012, 0.988)) / uGrid;
            vec3 image = texture2D(uAtlas, atlasUV).rgb;
            vec3 color = mix(vec3(0.88, 0.85, 0.80), image, fill);
            gl_FragColor = vec4(color * mix(0.64, 1.0, sqrt(max(0.0, vDepth))), 1.0);
        }
    `;

    function createMesh(columns, rows, interleaved) {
        // The robot atlas is already ordered so that the two sources alternate.
        const tiles = Array.from({ length: columns * rows }, (_, index) => index);
        if (!interleaved) {
            let seed = 29;
            for (let i = tiles.length - 1; i > 0; i--) {
                seed = (seed * 48271) % 2147483647;
                const j = seed % (i + 1);
                [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
            }
        }

        const vertices = [];
        const rings = 13;
        const subdivisions = 3;
        const latStep = Math.PI / rings;
        let tile = 0;
        for (let ring = 0; ring < rings; ring++) {
            const north = Math.PI / 2 - ring * latStep;
            const count = Math.max(3, Math.round(26 * Math.cos(north - latStep / 2)));
            const lonStep = 2 * Math.PI / count;
            for (let column = 0; column < count; column++) {
                const lon = (column + (ring % 2) * 0.5) * lonStep;
                const sample = tiles[tile % tiles.length];
                const cellX = sample % columns;
                const cellY = Math.floor(sample / columns);
                tile++;

                const vertex = (u, v) => {
                    const lat = north - v * latStep;
                    const angle = lon + u * lonStep;
                    const radius = Math.cos(lat);
                    vertices.push(radius * Math.sin(angle), Math.sin(lat), radius * Math.cos(angle), u, v, cellX, cellY);
                };
                for (let y = 0; y < subdivisions; y++) {
                    for (let x = 0; x < subdivisions; x++) {
                        const left = x / subdivisions;
                        const right = (x + 1) / subdivisions;
                        const top = y / subdivisions;
                        const bottom = (y + 1) / subdivisions;
                        vertex(left, top);
                        vertex(left, bottom);
                        vertex(right, top);
                        vertex(right, top);
                        vertex(left, bottom);
                        vertex(right, bottom);
                    }
                }
            }
        }
        return new Float32Array(vertices);
    }

    function compile(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(shader));
        }
        return shader;
    }

    function createRenderer(gl, atlas, { columns, rows, interleaved }) {
        const program = gl.createProgram();
        gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexSource));
        gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(program));
        }
        gl.useProgram(program);

        const mesh = createMesh(columns, rows, interleaved);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW);
        for (const [name, size, offset] of [['aPosition', 3, 0], ['aTileUV', 2, 12], ['aTileIndex', 2, 20]]) {
            const attribute = gl.getAttribLocation(program, name);
            gl.enableVertexAttribArray(attribute);
            gl.vertexAttribPointer(attribute, size, gl.FLOAT, false, 28, offset);
        }

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
        gl.uniform2f(gl.getUniformLocation(program, 'uGrid'), columns, rows);
        gl.enable(gl.DEPTH_TEST);

        const spin = gl.getUniformLocation(program, 'uSpin');
        return (angle) => {
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.uniform2f(spin, Math.cos(angle), Math.sin(angle));
            gl.drawArrays(gl.TRIANGLES, 0, mesh.length / 7);
        };
    }

    async function mount(figure) {
        const canvas = figure.querySelector('canvas');
        const poster = figure.querySelector('img');
        const toggle = figure.querySelector('button');
        const card = figure.closest('article');
        const name = document.getElementById(card.getAttribute('aria-labelledby')).textContent;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const grid = {
            columns: Number(figure.dataset.columns),
            rows: Number(figure.dataset.rows),
            interleaved: figure.hasAttribute('data-interleaved')
        };

        const gl = canvas.getContext('webgl');
        if (!gl) return;
        const atlas = new Image();
        atlas.src = figure.dataset.atlas;
        await atlas.decode();

        let render = createRenderer(gl, atlas, grid);
        let angle = 0.22;
        let playing = !reducedMotion.matches;
        let visible = false;
        let ready = true;
        let pointerId = null;
        let lastX = 0;
        let frameId = 0;
        let previousTime = 0;

        function draw() {
            if (!ready) return;
            const size = Math.round(canvas.parentElement.clientWidth * Math.min(window.devicePixelRatio, 2));
            if (canvas.width !== size || canvas.height !== size) {
                canvas.width = size;
                canvas.height = size;
            }
            render(angle);
        }

        function advance(time) {
            frameId = 0;
            if (previousTime) angle += Math.min(time - previousTime, 50) * 0.00011;
            previousTime = time;
            draw();
            syncAnimation();
        }

        function syncAnimation() {
            if (ready && playing && visible && !document.hidden && pointerId === null) {
                if (!frameId) frameId = requestAnimationFrame(advance);
            } else {
                cancelAnimationFrame(frameId);
                frameId = 0;
                previousTime = 0;
            }
        }

        function setPlaying(value) {
            playing = value;
            const action = playing ? 'Pause' : 'Play';
            toggle.firstElementChild.textContent = action;
            toggle.setAttribute('aria-label', `${action} ${name} globe rotation`);
            syncAnimation();
        }

        function showCanvas() {
            draw();
            canvas.hidden = false;
            poster.hidden = true;
            toggle.hidden = false;
        }

        canvas.addEventListener('pointerdown', (event) => {
            if (pointerId !== null || !event.isPrimary || event.button !== 0) return;
            pointerId = event.pointerId;
            lastX = event.clientX;
            canvas.setPointerCapture(pointerId);
            syncAnimation();
        });
        canvas.addEventListener('pointermove', (event) => {
            if (event.pointerId !== pointerId) return;
            angle += (event.clientX - lastX) * Math.PI / canvas.clientWidth;
            lastX = event.clientX;
            draw();
        });
        canvas.addEventListener('lostpointercapture', () => {
            pointerId = null;
            syncAnimation();
        });
        canvas.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            angle += event.key === 'ArrowLeft' ? -0.18 : 0.18;
            draw();
        });
        canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            ready = false;
            canvas.hidden = true;
            poster.hidden = false;
            toggle.hidden = true;
            syncAnimation();
        });
        canvas.addEventListener('webglcontextrestored', () => {
            render = createRenderer(gl, atlas, grid);
            ready = true;
            showCanvas();
            syncAnimation();
        });
        toggle.addEventListener('click', () => setPlaying(!playing));
        reducedMotion.addEventListener('change', (event) => setPlaying(!event.matches));
        document.addEventListener('visibilitychange', syncAnimation);

        new ResizeObserver(draw).observe(canvas.parentElement);
        new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            syncAnimation();
        }).observe(canvas.parentElement);
        setPlaying(playing);
        showCanvas();
    }

    const loadGlobe = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            loadGlobe.unobserve(entry.target);
            mount(entry.target).catch(() => {
                // Keep the poster visible if the texture or WebGL renderer is unavailable.
            });
        }
    }, { rootMargin: '240px' });
    document.querySelectorAll('.dataset-figure').forEach((figure) => loadGlobe.observe(figure));
})();

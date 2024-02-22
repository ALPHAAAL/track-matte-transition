const vertexShader = `
    attribute vec4 aVertexPosition;
    attribute vec2 aTextureCoord;

    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;

    varying highp vec2 vTextureCoord;

    void main() {
        gl_Position = aVertexPosition;
        vTextureCoord = aTextureCoord;
    }
`;

const fragmentShader = `
    precision mediump float;

    varying highp vec2 vTextureCoord;

    uniform sampler2D uSampler1;
    uniform sampler2D uSampler2;
    uniform sampler2D uSampler3;

    void main(void) {
        vec4 videoColor = texture2D(uSampler3, vTextureCoord);

        vec4 sceneColor = videoColor.r == 0.0 && videoColor.g == 0.0 && videoColor.b == 0.0 ? texture2D(uSampler1, vTextureCoord) : texture2D(uSampler2, vTextureCoord);
        gl_FragColor = vec4(sceneColor.r, sceneColor.g, sceneColor.b, sceneColor.a);
    }
`;

function loadShader(gl, type, source) {
    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader error', type, source);
        gl.deleteShader(shader);

        return null;
    }

    return shader;
}

function initShaderProgram(gl, vs, fs) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vs);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fs);
    const shaderProgram = gl.createProgram();

    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.error('Failed to load shader program');

        return null;
    }

    return shaderProgram;
}

function initPositionBuffer(gl) {
    const positionBuffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    const positions = [
        -1.0, -1.0,
        1.0, -1.0,
        -1.0, 1.0,
        -1.0, 1.0,
        1.0, -1.0,
        1.0, 1.0,
    ];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    return positionBuffer;
}

function initBuffers(gl) {
    const positionBuffer = initPositionBuffer(gl);
    const textureCoordBuffer = initTextureBuffer(gl);

    return {
        position: positionBuffer,
        textureCoord: textureCoordBuffer,
    };
}

function createTexture(gl) {
    const texture = gl.createTexture();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Because video has to be download over the internet
    // they might take a moment until it's ready so
    // put a single pixel in the texture so we can
    // use it immediately.
    const level = 0;
    const internalFormat = gl.RGBA;
    const width = 1;
    const height = 1;
    const border = 0;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const pixel = new Uint8Array([0, 0, 255, 255]); // opaque blue
    gl.texImage2D(
        gl.TEXTURE_2D,
        level,
        internalFormat,
        width,
        height,
        border,
        srcFormat,
        srcType,
        pixel
    );

    // Turn off mips and set wrapping to clamp to edge so it
    // will work regardless of the dimensions of the video.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    return texture;
}

function updateTexture(gl, texture, video) {
    const level = 0;
    const internalFormat = gl.RGBA;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
        gl.TEXTURE_2D,
        level,
        internalFormat,
        srcFormat,
        srcType,
        video,
    );
}

function initTextureBuffer(gl) {
    const textureCoordBuffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);

    const textureCoordinates = [
        0.0, 0.0,
        1.0, 0.0,
        0.0, 1.0,
        0.0, 1.0,
        1.0, 0.0,
        1.0, 1.0,
    ];

    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(textureCoordinates),
        gl.STATIC_DRAW,
    );

    return textureCoordBuffer;
}

function setPositionAttributes(gl, buffers, programInfo) {
    const numComponents = 2; // pull out 2 values per iteration
    const type = gl.FLOAT; // the data in the buffer is 32bit floats
    const normalize = false; // don't normalize
    const stride = 0; // how many bytes to get from one set of values to the next
    // 0 = use type and numComponents above
    const offset = 0; // how many bytes inside the buffer to start from

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(
        programInfo.attribLocations.vertexPosition,
        numComponents,
        type,
        normalize,
        stride,
        offset,
    );
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
}

function drawScene(gl, programInfo, buffers, texture1, texture2, videoTexture) {
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const fieldOfView = 45 * Math.PI / 180;
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const zNear = 0.1;
    const zFar = 100.0;
    const projectionMatrix = mat4.create();

    mat4.perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);

    const modelViewMatrix = mat4.create();

    mat4.translate(modelViewMatrix, modelViewMatrix, [0, 0, -6]);

    setPositionAttributes(gl, buffers, programInfo);
    setTextureAttribute(gl, buffers, programInfo);

    gl.useProgram(programInfo.program);

    gl.uniformMatrix4fv(
        programInfo.uniformLocations.projectionMatrix,
        false,
        projectionMatrix,
    );
    gl.uniformMatrix4fv(
        programInfo.uniformLocations.modelViewMatrix,
        false,
        modelViewMatrix,
    );

    // Tell WebGL we want to affect texture unit 0
    gl.activeTexture(gl.TEXTURE0);

    // Bind the texture to texture unit 0
    gl.bindTexture(gl.TEXTURE_2D, texture1);

    // Tell the shader we bound the texture to texture unit 0
    gl.uniform1i(programInfo.uniformLocations.uSampler1, 0);

    // Tell WebGL we want to affect texture unit 0
    gl.activeTexture(gl.TEXTURE1);

    // Bind the texture to texture unit 0
    gl.bindTexture(gl.TEXTURE_2D, texture2);

    // Tell the shader we bound the texture to texture unit 0
    gl.uniform1i(programInfo.uniformLocations.uSampler2, 1);

    // Tell WebGL we want to affect texture unit 0
    gl.activeTexture(gl.TEXTURE2);

    // Bind the texture to texture unit 0
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);

    // Tell the shader we bound the texture to texture unit 0
    gl.uniform1i(programInfo.uniformLocations.uSampler3, 2);

    {
        const offset = 0;
        const vertexCount = 6;

        gl.drawArrays(gl.TRIANGLES, offset, vertexCount);
    }
}

function setTextureAttribute(gl, buffers, programInfo) {
    const num = 2;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = 0;
    const offset = 0;

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.textureCoord);
    gl.vertexAttribPointer(
        programInfo.attribLocations.textureCoord,
        num,
        type,
        normalize,
        stride,
        offset,
    );
    gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
}

function setupVideo(video) {
    return new Promise((resolve) => {
        let playing = false;
        let timeupdate = false;

        video.playsInline = true;
        video.loop = true;

        video.addEventListener('playing', () => {
            playing = true;

            if (timeupdate) {
                resolve(video);
            }
        }, true);

        video.addEventListener('timeupdate', () => {
            timeupdate = true;

            if (playing) {
                resolve(video);
            }
        }, true);

        // video.play();
    });
}

function loadImage(image) {
    return new Promise((resolve) => {
        image.onload = () => {
            console.log('onload');
            resolve(image);
        };
    })
}

const canvas = document.querySelector('#glCanvas');
const gl = canvas.getContext('webgl');
const shaderProgram = initShaderProgram(gl, vertexShader, fragmentShader);
const programInfo = {
    program: shaderProgram,
    attribLocations: {
        vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
        textureCoord: gl.getAttribLocation(shaderProgram, "aTextureCoord"),
    },
    uniformLocations: {
        projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
        modelMatrix: gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
        uSampler1: gl.getUniformLocation(shaderProgram, "uSampler1"),
        uSampler2: gl.getUniformLocation(shaderProgram, "uSampler2"),
        uSampler3: gl.getUniformLocation(shaderProgram, "uSampler3"),
    },
};

const scene1 = document.getElementById('scene1');
const scene2 = document.getElementById('scene2');
const video = document.getElementById('texture');

const buffers = initBuffers(gl);

function render(t1, t2, videoTexture, video) {
    if (video.readyState >= 3) {
        updateTexture(gl, videoTexture, video);
    }

    drawScene(gl, programInfo, buffers, t1, t2, videoTexture);

    requestAnimationFrame(() => { render(t1, t2, videoTexture, video) });
}

const t1 = createTexture(gl);
const t2 = createTexture(gl);
const videoTexture = createTexture(gl);

Promise.all([
    loadImage(scene1),
    loadImage(scene2),
]).then(() => {
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    updateTexture(gl, t1, scene1);
    updateTexture(gl, t2, scene2);
    drawScene(gl, programInfo, buffers, t1, t2, videoTexture);

    setupVideo(video).then((video) => {
        render(t1, t2, videoTexture, video);
    });
});

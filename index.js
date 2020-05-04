'use strict';

module.exports = {pixelmatch, rgb2yiq, diffsPixelsCount};

const defaultOptions = {
    threshold: 0.1,         // matching threshold (0 to 1); smaller is more sensitive
    includeAA: false,       // whether to skip anti-aliasing detection
    alpha: 0.5,             // opacity of original image in diff ouput
    aaColor: [255, 255, 0], // color of anti-aliased pixels in diff output
    diffColor: [255, 0, 0], // color of different pixels in diff output
    diffColorAlt: null,     // whether to detect dark on light differences between img1 and img2 and set an alternative color to differentiate between the two
    diffMask: false         // draw the diff over a transparent background (a mask)
};


function pixelmatch({img1, img2, output, startHeightImg1, startWidthImg1, options}) {

    if (!isPixelData(img1.data) || !isPixelData(img2.data) || (output && !isPixelData(output)))
        throw new Error('Image data: Uint8Array, Uint8ClampedArray or Buffer expected.');

    // if (img1.length !== img2.length || (output && output.length !== img1.length))
    //     throw new Error('Image sizes do not match.');
    //
    // if (img1.length !== width * height * 4) throw new Error('Image data size does not match width/height.');

    options = Object.assign({}, defaultOptions, options);

    // check if images are identical
    const len1 = img1.width * img1.height;
    const len2 = img2.width * img2.height;
    const a32 = new Uint32Array(img1.data.buffer, img1.data.byteOffset, len1);
    const b32 = new Uint32Array(img2.data.buffer, img2.data.byteOffset, len2);
    let identical = true;

    for (let i = 0; i < len2; i++) {
        if (a32[i] !== b32[i]) {
            identical = false;
            break;
        }
    }
    if (identical) { // fast path if identical
        if (output && !options.diffMask) {
            for (let i = 0; i < len2; i++) drawGrayPixel(img1, 4 * i, options.alpha, output);
        }
        console.log('Images are identical');
        return 0;
    }

    // maximum acceptable square distance between two colors;
    // 35215 is the maximum possible value for the YIQ difference metric
    const maxDelta = 35215 * options.threshold * options.threshold;
    let diff = 0;

    // compare each pixel of one image against the other one
    for (let y = 0; y < img2.height; y++) {
        for (let x = 0; x < img2.width; x++) {

            const posImg1 = ((y + startHeightImg1) * img1.width + x + startWidthImg1) * 4;
            // console.log(posImg1);
            const posImg2 = (y * img2.width + x) * 4;

            // squared YUV distance between colors at this pixel position, negative if the img2 pixel is darker
            const delta = colorDelta(img1.data, img2.data, posImg1, posImg2);

            // the color difference is above the threshold
            if (Math.abs(delta) > maxDelta) {
                // check it's a real rendering difference or just anti-aliasing
                if (!options.includeAA && (
                    antialiased(img1.data, x + startWidthImg1, y + startHeightImg1, img1.width, img1.height, img2.data) ||
                    antialiased(img2.data, x, y, img2.width, img2.height, img1.data))) {
                    // one of the pixels is anti-aliasing; draw as yellow and do not count as difference
                    // note that we do not include such pixels in a mask
                    if (output && !options.diffMask) drawPixel(output, posImg1, ...options.aaColor);

                } else {
                    // found substantial difference not caused by anti-aliasing; draw it as such
                    if (output) {
                        drawPixel(output, posImg1, ...(delta < 0 && options.diffColorAlt || options.diffColor));
                    }
                    diff++;
                }

            } else if (output) {
                // pixels are similar; draw background as grayscale image blended with white
                if (!options.diffMask) drawGrayPixel(img1.data, posImg1, options.alpha, output);
            }
        }
    }

    // return the number of different pixels
    return diff;
}

// eslint-disable-next-line no-unused-vars
function diffsPixelsCount({img1, img2, output, startHeightImg1, startWidthImg1, options}) {

    if (!isPixelData(img1.data) || !isPixelData(img2.data) || (output && !isPixelData(output)))
        throw new Error('Image data: Uint8Array, Uint8ClampedArray or Buffer expected.');

    options = Object.assign({}, defaultOptions, options);
    const maxDelta = 35215 * options.threshold * options.threshold;

    let diff = 0;

    // compare each pixel of one image against the other one
    for (let y = 0; y < img2.height; y++) {
        for (let x = 0; x < img2.width; x++) {

            const posImg1 = ((y + startHeightImg1) * img1.width + x + startWidthImg1) * 4;
            const posImg2 = (y * img2.width + x) * 4;

            // squared YUV distance between colors at this pixel position, negative if the img2 pixel is darker
            const delta = colorDelta(img1.data, img2.data, posImg1, posImg2);

            // the color difference is above the threshold
            if (Math.abs(delta) > maxDelta) {
                if (!antialiased(img1.data, x + startWidthImg1, y + startHeightImg1, img1.width, img1.height, img2.data) &&
                    !antialiased(img2.data, x, y, img2.width, img2.height, img1.data)) {
                    diff++;
                }
            }
        }
    }
    return diff;
}

function isPixelData(arr) {
    // work around instanceof Uint8Array not working properly in some Jest environments
    // console.log(`ArrayBuffer.isView(arr): ${ArrayBuffer.isView(arr)}`);
    // console.log(`arr.constructor.BYTES_PER_ELEMENT: ${arr.constructor.BYTES_PER_ELEMENT}`);
    return ArrayBuffer.isView(arr) && arr.constructor.BYTES_PER_ELEMENT === 1;
}

function rgb2yiq(img1, output, options) {

    if (!isPixelData(img1.data) || (output && !isPixelData(output)))
        throw new Error('Image data: Uint8Array, Uint8ClampedArray or Buffer expected.');

    if (img1.data.length !== img1.width * img1.height * 4) throw new Error('Image data size does not match width/height.');

    options = Object.assign({}, defaultOptions, options);

    // check if images are identical
    const len = img1.width * img1.height;

    if (output && !options.diffMask) {
        console.log('Printing gray image...');
        for (let i = 0; i < len; i++) drawGrayPixel(img1.data, 4 * i, options.alpha, output);
    }
    // return 0;

    // maximum acceptable square distance between two colors;
    // 35215 is the maximum possible value for the YIQ difference metric
    // const maxDelta = 35215 * options.threshold * options.threshold;
    // let diff = 0;

    // compare each pixel of one image against the other one
    // for (let y = 0; y < img1.height; y++) {
    //     for (let x = 0; x < img1.width; x++) {
    //
    //         const pos = (y * img1.width + x) * 4;
    //
    //         // the color difference is above the threshold
    //         if (Math.abs(delta) > maxDelta) {
    //             // check it's a real rendering difference or just anti-aliasing
    //             if (!options.includeAA && (antialiased(img1, x, y, width, height, img2) ||
    //                 antialiased(img2, x, y, width, height, img1))) {
    //                 // one of the pixels is anti-aliasing; draw as yellow and do not count as difference
    //                 // note that we do not include such pixels in a mask
    //                 if (output && !options.diffMask) drawPixel(output, pos, ...options.aaColor);
    //
    //             } else {
    //                 // found substantial difference not caused by anti-aliasing; draw it as such
    //                 if (output) {
    //                     drawPixel(output, pos, ...(delta < 0 && options.diffColorAlt || options.diffColor));
    //                 }
    //                 diff++;
    //             }
    //
    //         } else if (output) {
    //             // pixels are similar; draw background as grayscale image blended with white
    //             if (!options.diffMask) drawGrayPixel(img1, pos, options.alpha, output);
    //         }
    //     }
    // }

    // return the number of different pixels
    // return diff;
}

// check if a pixel is likely a part of anti-aliasing;
// based on "Anti-aliased Pixel and Intensity Slope Detector" paper by V. Vysniauskas, 2009

function antialiased(img, x1, y1, width, height, img2) {
    const x0 = Math.max(x1 - 1, 0);
    const y0 = Math.max(y1 - 1, 0);
    const x2 = Math.min(x1 + 1, width - 1);
    const y2 = Math.min(y1 + 1, height - 1);
    const pos = (y1 * width + x1) * 4;
    let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;
    let min = 0;
    let max = 0;
    let minX, minY, maxX, maxY;

    // go through 8 adjacent pixels
    for (let x = x0; x <= x2; x++) {
        for (let y = y0; y <= y2; y++) {
            if (x === x1 && y === y1) continue;

            // brightness delta between the center pixel and adjacent one
            const delta = colorDelta(img, img, pos, (y * width + x) * 4, true);

            // count the number of equal, darker and brighter adjacent pixels
            if (delta === 0) {
                zeroes++;
                // if found more than 2 equal siblings, it's definitely not anti-aliasing
                if (zeroes > 2) return false;

                // remember the darkest pixel
            } else if (delta < min) {
                min = delta;
                minX = x;
                minY = y;

                // remember the brightest pixel
            } else if (delta > max) {
                max = delta;
                maxX = x;
                maxY = y;
            }
        }
    }

    // if there are no both darker and brighter pixels among siblings, it's not anti-aliasing
    if (min === 0 || max === 0) return false;

    // if either the darkest or the brightest pixel has 3+ equal siblings in both images
    // (definitely not anti-aliased), this pixel is anti-aliased
    return (hasManySiblings(img, minX, minY, width, height) && hasManySiblings(img2, minX, minY, width, height)) ||
        (hasManySiblings(img, maxX, maxY, width, height) && hasManySiblings(img2, maxX, maxY, width, height));
}

// check if a pixel has 3+ adjacent pixels of the same color.
function hasManySiblings(img, x1, y1, width, height) {
    const x0 = Math.max(x1 - 1, 0);
    const y0 = Math.max(y1 - 1, 0);
    const x2 = Math.min(x1 + 1, width - 1);
    const y2 = Math.min(y1 + 1, height - 1);
    const pos = (y1 * width + x1) * 4;
    let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;

    // go through 8 adjacent pixels
    for (let x = x0; x <= x2; x++) {
        for (let y = y0; y <= y2; y++) {
            if (x === x1 && y === y1) continue;

            const pos2 = (y * width + x) * 4;
            if (img[pos] === img[pos2] &&
                img[pos + 1] === img[pos2 + 1] &&
                img[pos + 2] === img[pos2 + 2] &&
                img[pos + 3] === img[pos2 + 3]) zeroes++;

            if (zeroes > 2) return true;
        }
    }

    return false;
}

// calculate color difference according to the paper "Measuring perceived color difference
// using YIQ NTSC transmission color space in mobile applications" by Y. Kotsarenko and F. Ramos

function colorDelta(img1, img2, k, m, yOnly) {
    let r1 = img1[k + 0];
    let g1 = img1[k + 1];
    let b1 = img1[k + 2];
    let a1 = img1[k + 3];

    let r2 = img2[m + 0];
    let g2 = img2[m + 1];
    let b2 = img2[m + 2];
    let a2 = img2[m + 3];

    if (a1 === a2 && r1 === r2 && g1 === g2 && b1 === b2) return 0;

    if (a1 < 255) {
        console.log(JSON.stringify(img1));
        a1 /= 255;
        r1 = blend(r1, a1);
        g1 = blend(g1, a1);
        b1 = blend(b1, a1);
    }

    if (a2 < 255) {
        console.log(JSON.stringify(img1));
        a2 /= 255;
        r2 = blend(r2, a2);
        g2 = blend(g2, a2);
        b2 = blend(b2, a2);
    }

    const y1 = rgb2y(r1, g1, b1);
    const y2 = rgb2y(r2, g2, b2);
    const y = y1 - y2;

    if (yOnly) return y; // brightness difference only

    const i1 = rgb2i(r1, g1, b1);
    const i2 = rgb2i(r2, g2, b2);
    const i = i1 - i2;

    const q1 = rgb2q(r1, g1, b1);
    const q2 = rgb2q(r2, g2, b2);
    const q = q1 - q2;

    const delta = 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;
    // console.log(`RGB1 - ${r1},${g1},${b1}`);
    // console.log(`YIQ1 - ${y1},${i1},${q1}`);
    // console.log(`RGB2 - ${r2},${g2},${b2}`);
    // console.log(`YIQ2 - ${y2},${i2},${q2}`);
    // console.log(delta);
    // console.log(`${y1}, ${y2}, ${y}, ${i}, ${q}`);

    // encode whether the pixel lightens or darkens in the sign
    return y1 > y2 ? -delta : delta;
}

function rgb2y(r, g, b) {
    return r * 0.29889531 + g * 0.58662247 + b * 0.11448223;
}

function rgb2i(r, g, b) {
    return r * 0.59597799 - g * 0.27417610 - b * 0.32180189;
}

function rgb2q(r, g, b) {
    return r * 0.21147017 - g * 0.52261711 + b * 0.31114694;
}

// blend semi-transparent color with white
function blend(c, a) {
    return 255 + (c - 255) * a;
}

function drawPixel(output, pos, r, g, b) {
    output[pos + 0] = r;
    output[pos + 1] = g;
    output[pos + 2] = b;
    output[pos + 3] = 255;
}

function drawGrayPixel(img, i, alpha, output) {
    const r = img[i + 0];
    const g = img[i + 1];
    const b = img[i + 2];
    const val = blend(rgb2y(r, g, b), alpha * img[i + 3] / 255);
    drawPixel(output, i, val, val, val);
}

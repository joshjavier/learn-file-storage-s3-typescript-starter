import path from "path";

export async function getVideoAspectRatio(
  filePath: string,
): Promise<"landscape" | "portrait" | "other"> {
  const proc = Bun.spawn(
    [
      "ffprobe",
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      filePath,
    ],
    { stderr: "pipe" },
  );

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error("Error getting video's aspect ratio");
  }

  const outputText = await new Response(proc.stdout).text();
  const errorsText = await new Response(proc.stderr).text();

  let output;
  try {
    output = JSON.parse(outputText);
  } catch (err) {
    throw new Error("Invalid JSON");
  }

  if (!output.streams || output.streams.length === 0) {
    throw new Error("No video streams found");
  }

  const { width, height } = output.streams[0];
  const [w, h] = getAspectRatio(width / height, 50);

  if (w === 16 && h === 9) {
    return "landscape";
  } else if (w === 9 && h === 16) {
    return "portrait";
  } else {
    return "other";
  }
}

/**
 * Finds the simplest fraction approximation for a given decimal ratio.
 *
 * Uses the Stern-Brocot tree algorithm to find a rational approximation
 * of the input value with a denominator not exceeding the specified limit.
 *
 * @param {number} val - The decimal ratio to approximate (e.g., width/height)
 * @param {number} lim - The maximum denominator allowed in the result
 * @returns {[number, number]} A tuple representing the aspect ratio as [numerator, denominator]
 *
 * @example
 * getAspectRatio(1920 / 1080, 50) // Returns [16, 9] for widescreen
 * getAspectRatio(720 / 1280, 50) // Returns [9, 16] for portrait
 *
 * @link https://stackoverflow.com/a/43016456/11619513
 */
function getAspectRatio(val: number, lim: number): [number, number] {
  let lower: [number, number] = [0, 1];
  let upper: [number, number] = [1, 0];

  while (true) {
    const mediant: [number, number] = [
      lower[0] + upper[0],
      lower[1] + upper[1],
    ];

    if (val * mediant[1] > mediant[0]) {
      if (lim < mediant[1]) {
        return upper;
      }
      lower = mediant;
    } else if (val * mediant[1] === mediant[0]) {
      if (lim >= mediant[1]) {
        return mediant;
      }
      if (lower[1] < upper[1]) {
        return lower;
      }
      return upper;
    } else {
      if (lim < mediant[1]) {
        return lower;
      }
      upper = mediant;
    }
  }
}

export async function processVideoForFastStart(inputFilePath: string) {
  const input = path.parse(inputFilePath);
  const outputFilePath = path.join(
    input.dir,
    `${input.name}.processed${input.ext}`,
  );

  const proc = Bun.spawn([
    "ffmpeg",
    "-i",
    inputFilePath,
    "-movflags",
    "faststart",
    "-map_metadata",
    "0",
    "-codec",
    "copy",
    "-f",
    "mp4",
    outputFilePath,
  ]);

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error("Error processing video for fast start");
  }

  return outputFilePath;
}

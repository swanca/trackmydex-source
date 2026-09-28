export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface ProjectedBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Project a detector box onto a video displayed with `object-fit: cover`. */
export function projectObjectCoverBox(
  box: Rectangle,
  frame: Size,
  viewport: Size,
): ProjectedBox | null {
  if (frame.width <= 0 || frame.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return null;
  }

  const scale = Math.max(viewport.width / frame.width, viewport.height / frame.height);
  const offsetX = (viewport.width - frame.width * scale) / 2;
  const offsetY = (viewport.height - frame.height * scale) / 2;

  return {
    left: offsetX + box.x * scale,
    top: offsetY + box.y * scale,
    width: box.width * scale,
    height: box.height * scale,
  };
}

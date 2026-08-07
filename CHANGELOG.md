# Changelog

## 1.0.0

Rotation correctness, transforms, undo/redo, an incremental mutation API,
render extension points, and keyboard operation.

### Fixed

- **Annotations were misplaced whenever the viewport was rotated.**
  `pointToElement`/`elementToPoint` preferred a local copy of OpenSeadragon's
  private `_pixelFromPointNoRotate` over the viewport's own conversion. That
  copy omits the rotation step the real `_pixelFromPoint` performs, and because
  it read private fields a real viewer always has, it always succeeded — the
  rotation-aware API was never reached. Conversion now goes through
  `imageToViewerElementCoordinates` / `viewerElementToImageCoordinates` only.
- **Horizontal flip was ignored.** OpenSeadragon applies flip as `scale(-1,1)`
  at draw time and keeps it out of its coordinate maths, so an element-space
  overlay has to mirror x itself.
- **A shape dragged against a canvas edge was distorted.** Each point was
  clamped independently. The move gesture now constrains the whole shape as a
  rigid body.
- **`fillOpacity` and `activeColor` were dead.** Both were declared, defaulted,
  and never read. `activeColor` now tints the selected shape's handles;
  `fillOpacity` is optional and emitted only when a host sets it, because the
  default `fillColor` carries its own alpha and emitting both multiplies them.
- **`destroy()` left the container's inline `position` behind**, changing the
  host's layout for anything positioned against it.
- **`role="application"`** became `role="group"`. The former tells a screen
  reader to surrender all its key handling, which is only honest for a widget
  with a complete keyboard model of its own.

### Added

- **Geometry transforms** (`src/transform.ts`): centroid, rotation, scaling,
  constrained translation, transformed bounds, and matrix composition. Angles
  are degrees, positive is clockwise on screen, rotation defaults to the shape's
  own centre.
- **`oriented-rect`**, a new shape variant. Rotating a rectangle produces one
  rather than overloading `x`/`y`/`w`/`h`. `toPolygonPoints` projects any shape
  to an outline a standards adapter can serialize, and `toAxisAlignedRect`
  refuses to flatten an arbitrary angle to a bounding box.
- **Undo and redo.** A gesture is one entry however many previews it emitted.
  `canUndo`, `canRedo`, `undo`, `redo`, `clearHistory`, and an
  `onHistoryChanged` subscription.
- **Incremental mutation**: `addAnnotation`, `updateAnnotation`,
  `removeAnnotation`, `getAnnotation`, and `batch`. Previous values are
  returned, a duplicate id throws, and `setAnnotations` takes an explicit
  history policy.
- **Interaction policy.** A host marks any shape selectable, editable,
  deletable, rotatable, or visible. Read-only shapes stay selectable.
- **Render extension points.** Host control over shape classes and data
  attributes, label text, placement, orientation, and font-size bounds, plus
  full shape and point-glyph replacement. Labels are text nodes, never markup.
- **Per-shape rotation**, opt-in through `config.rotation.enabled`. Handle at a
  fixed screen distance, snapping with cardinal emphasis, and a programmatic
  `rotate(id, degrees, { pivot })`.
- **Keyboard operation**: arrows move, shift coarsens, alt resizes, brackets
  rotate, Tab traverses, ctrl/cmd-Z undoes. `setGeometry` and `nudge` let an
  accessible coordinate form write exact values back.
- **Vertex editing**: `insertVertex` at the nearest edge, `removeVertex` with
  minimums enforced, plus `commitDraft`, `cancelDrawing`, and `getDraft`.
- **Drawing constraints**: square and from-centre rectangles, minimum polygon
  area and minimum freehand length.
- **`AnnotationChange`** events carrying before and after geometry, with
  `transient` distinguishing a preview from a commit.
- **`OSDAnnotationEditor.capabilities`** for feature detection, and
  `hasAccurateProjection()` to detect the degraded no-viewport fallback.

### Changed

- A rotated rectangle resizes like any other. Its eight handles sit on its
  rotated edges, and the resize is computed in the rectangle's own frame so the
  opposite edge stays fixed and the shape does not shear.
- The rotation affordance is a short stub of fixed screen length ending in a
  small circular handle. It was previously a line from the shape's centre, which
  grew with the shape and with zoom.
- The stub anchors to the shape's own silhouette in the direction it points, so
  it touches the shape whatever its outline. Anchoring to the bounding box left
  it floating in open space beside a triangle or any polygon whose highest point
  is off to one side.
- An oriented rectangle's stub turns with the shape. A polygon or path has no
  angle to read, so its stub rests at screen up and follows the pointer for the
  duration of a rotation gesture rather than jumping as the bounding box changes
  underneath it.
- `openseadragon` is now a declared optional peer dependency, `>=4.0.0`. Only
  5.x is exercised in CI.
- The viewport event stream is coalesced to one render per animation frame.
  Host mutations still render synchronously, because a host that mutates and
  then measures must not read stale geometry.
- Resize cursors rotate with the viewport, so a handle labelled `n` shows a
  cursor matching the direction it actually moves.

### Notes for hosts

Nothing in the existing API was removed. `setAnnotations`, `select`, `delete`,
and the create/update/delete callbacks behave as before. The new
`onAnnotationChanged` callback supersedes the three older ones for any host that
wants transactions; the old ones fire only for committed changes.

Two behaviours changed shape without changing signature: a rectangle rotated
through `rotate()` comes back as an `oriented-rect`, and `setAnnotations` now
resets history by default. Both are described above.

## 0.1.2

Rotation-correct coordinates.

## 0.1.1

Initial release.

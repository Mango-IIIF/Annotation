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
- **`rotation` on every shape**, in degrees clockwise about the shape's own
  centre. Geometry stays stored unrotated, so `x`/`y`/`w`/`h` and `points` keep
  meaning what they always meant and a host that ignores the field sees the
  shape as it was rather than something wrong. `toPolygonPoints` gives the
  outline as drawn, which is what rendering, hit testing, and a standards
  adapter all want.
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
- The rotation affordance follows the Google Slides and PowerPoint convention: a
  short stub of fixed screen length from the shape's top edge to a small
  circular handle, which turns with the shape and stays where the user left it.
  It was previously a line from the shape's centre, which grew with the shape
  and with zoom.
- The stub anchors to the shape's own silhouette rather than to its bounding
  box, so it touches the shape whatever its outline — a triangle, or any polygon
  whose highest point is off to one side.
- Editing a vertex on a rotated shape bakes the rotation into its points and
  resets the angle. The shape is unchanged at that moment, and editing then
  happens in the same space the pointer is in. `bakeRotation` is exported for a
  host that wants the same conversion.
- `openseadragon` is now a declared optional peer dependency, `>=4.0.0`. Only
  5.x is exercised in CI.
- **Shapes are drawn in image coordinates inside a single transformed group.**
  OpenSeadragon's projection is affine, so a pan, zoom, rotation, or flip is now
  one `transform` attribute rather than a reprojection of every point of every
  annotation. `projectionMatrix` derives that matrix by projecting three points
  through the same conversion the editor uses, so it inherits its rotation and
  flip correctness rather than restating it.
- Labels and handles stay in an untransformed layer, since both must keep a
  constant screen size; point glyphs are counter-scaled for the same reason.
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

Shapes gained an optional `rotation`. A host that reads `geometry` directly and
ignores the field is safe: geometry is stored unrotated, so it sees the shape
before any rotation rather than something incorrect. A host that needs the shape
as drawn — for rendering, hit testing, or serializing to a selector — should use
`toPolygonPoints`, which applies the rotation. No selector in IIIF or the Web
Annotation model carries an angle, so a rotated shape serializes as the polygon
of its outline; the demo shows the two-line bridge.

`setAnnotations` now resets history by default, described above.

## 0.1.2

Rotation-correct coordinates.

## 0.1.1

Initial release.

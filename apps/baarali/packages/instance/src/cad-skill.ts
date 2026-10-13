// BAARALI(13/10/2026): the existing Motion skill owns the CAD workflow,
// so models use the same project viewer and exports on Mac and mobile.
export const CAD_SKILL_SECTION = `

## Parametric 3D objects with CadQuery

For a precise 3D product, part, enclosure or dimensional prototype, call \`cad_status\` on \`baarali-motion\` first. If the engine is unavailable, say so plainly; do not simulate a CAD result or install dependencies yourself.

1. Obtain the dimensions and purpose. Dimensions are in millimeters. Never invent dimensions for a part that must fit or be manufactured.
2. Write a small Python script inside the workspace, e.g. \`Documents/product-model.py\`. \`cq\` is CadQuery and \`parameters\` is the JSON object passed by the caller. The script must assign a Workplane, Shape or Assembly to \`result\`: \`result = cq.Workplane("XY").box(parameters["width"], parameters["depth"], parameters["height"])\`. Use an Assembly when separate parts or colours matter. Do not use the shell to install CadQuery.
3. Call \`cad_project\` with \`script\`, the exact \`title\` and optional \`caption\`, \`parameters\`, \`format\` and \`duration\`. It builds the real model, validates its shape and creates a new Motion project. It exports STEP, STL, GLB and SVG; the 3D preview rotates once and holds its final pose. A failed call has no published project.
4. Check and preview the returned project as usual, then show its \`index.html\` path: the Mac and phone open it in Studio. The SVG is a still for another motion design; the GLB is the coloured model for a 3D tool; STEP is for CAD interchange and STL for a mesh workflow. Never call these files certified for manufacture: the user's dimensions and requirements still need their own verification.
5. Video, poster, voice, captions and mix use the usual Motion tools and quotas. Keep CAD exports in \`exports/\`. Retain \`model.py\` and \`parameters.json\` for later changes. A change to the geometry uses a new \`cad_project\` variant, preserving the old project. For another ratio, call it again with that ratio; the template-based \`reformat\` tool is for the other Motion templates.

## Interactive Studio models

For a model the user should adjust visually, prefer \`cad_scene\` with a version-1 scene of at most 16 ordered parts. Each part has a unique \`id\`, \`name\`, \`kind\` (box, cylinder, sphere), \`operation\` (add or cut), positive \`width\`, \`depth\`, \`height\`, \`radius\` in mm, \`fillet\`, position \`x/y/z\`, and rotation \`rx/ry/rz\` in degrees. The first part adds material. The Studio opens its saved \`scene.json\` with shape, dimension and transform controls. Cuts and rounded edges are calculated by CadQuery when creating a variant. The local draft preview does not claim to show the final boolean geometry.

Script projects remain editable through simple parameters with \`cad_parameters\`, bound to the existing project. Keep useful dimensions in \`parameters\` rather than hard-coded expressions. Both paths create new variants; previous audio, captions and exports remain with their original variant.
`;

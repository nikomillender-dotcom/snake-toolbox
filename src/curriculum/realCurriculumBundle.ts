// realCurriculumBundle.ts (I1 seam: "CurriculumBundle loader"): assembles Byleth's REAL
// CurriculumBundle from the authored JSON bundle (bundle-manifest.json + awardMap.json +
// modules/m01.json..m33.json), mechanically copied verbatim into this directory from the
// curriculum-bundle source of truth (Manager-validated: 35/35 files parse). Byleth's content is
// HIS lane; this file does no content editing, only structural assembly into the CurriculumBundle
// shape (CONTRACT 4).
//
// m01 to m10 are fully authored (lessons, bosses, hiddenTests, glossary terms, reviewForms). m11
// to m33 are honest skeletons: a single lesson with one "prose" step whose body begins with the
// sentinel "PLACEHOLDER:", no boss, empty terms. That boundary is intentional and machine-detected
// by isPlaceholderModule() (bundleValidator.ts), which the sentinel-aware validation rules key off.
//
// Each module import is cast from its own narrow JSON-inferred literal type to `Module` file-by-file
// (never as a combined array literal) so tsc does not have to union 33 large structural types.
import type { CurriculumBundle, Module, Phase, StatAwardMap, Unit } from "../contracts.js";

import manifest from "./bundle-manifest.json";
import awardMapJson from "./awardMap.json";

import m01 from "./modules/m01.json";
import m02 from "./modules/m02.json";
import m03 from "./modules/m03.json";
import m04 from "./modules/m04.json";
import m05 from "./modules/m05.json";
import m06 from "./modules/m06.json";
import m07 from "./modules/m07.json";
import m08 from "./modules/m08.json";
import m09 from "./modules/m09.json";
import m10 from "./modules/m10.json";
import m11 from "./modules/m11.json";
import m12 from "./modules/m12.json";
import m13 from "./modules/m13.json";
import m14 from "./modules/m14.json";
import m15 from "./modules/m15.json";
import m16 from "./modules/m16.json";
import m17 from "./modules/m17.json";
import m18 from "./modules/m18.json";
import m19 from "./modules/m19.json";
import m20 from "./modules/m20.json";
import m21 from "./modules/m21.json";
import m22 from "./modules/m22.json";
import m23 from "./modules/m23.json";
import m24 from "./modules/m24.json";
import m25 from "./modules/m25.json";
import m26 from "./modules/m26.json";
import m27 from "./modules/m27.json";
import m28 from "./modules/m28.json";
import m29 from "./modules/m29.json";
import m30 from "./modules/m30.json";
import m31 from "./modules/m31.json";
import m32 from "./modules/m32.json";
import m33 from "./modules/m33.json";

const REAL_MODULES: Module[] = [
  m01 as unknown as Module,
  m02 as unknown as Module,
  m03 as unknown as Module,
  m04 as unknown as Module,
  m05 as unknown as Module,
  m06 as unknown as Module,
  m07 as unknown as Module,
  m08 as unknown as Module,
  m09 as unknown as Module,
  m10 as unknown as Module,
  m11 as unknown as Module,
  m12 as unknown as Module,
  m13 as unknown as Module,
  m14 as unknown as Module,
  m15 as unknown as Module,
  m16 as unknown as Module,
  m17 as unknown as Module,
  m18 as unknown as Module,
  m19 as unknown as Module,
  m20 as unknown as Module,
  m21 as unknown as Module,
  m22 as unknown as Module,
  m23 as unknown as Module,
  m24 as unknown as Module,
  m25 as unknown as Module,
  m26 as unknown as Module,
  m27 as unknown as Module,
  m28 as unknown as Module,
  m29 as unknown as Module,
  m30 as unknown as Module,
  m31 as unknown as Module,
  m32 as unknown as Module,
  m33 as unknown as Module,
];

export const REAL_CURRICULUM_BUNDLE: CurriculumBundle = {
  version: manifest.version,
  phases: manifest.phases as unknown as Phase[],
  units: manifest.units as unknown as Unit[],
  modules: REAL_MODULES,
  awardMap: awardMapJson as unknown as StatAwardMap,
};

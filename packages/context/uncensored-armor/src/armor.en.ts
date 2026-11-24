/** SPDX-License-Identifier: MIT
 * Copyright (c) 2026 小杨. Prompt source: Water-Run/dsh-purge at e1d8e59087857fa86d0ef2bb9878800274b13a29.
 * Full permission notice: LICENSES/dsh-purge-MIT.txt in this repository.
 */
/**
 * The composed armor prompt (en). One section carries the upstream core, this
 * fork's own layer, and the closing targeted rules in that order, so the mandatory
 * prelude precedes the task material and the targeted rules survive long contexts.
 *
 * @module
 */

import { CORE_EN } from './core/en.ts'
import { LOCAL_EN } from './local/en.ts'
import { TARGETED_EN } from './local/rules.en.ts'

/** Armor prompt text mounted by the section registry. */
export const ARMOR_EN = `${CORE_EN}\n\n${LOCAL_EN}\n\n${TARGETED_EN}`

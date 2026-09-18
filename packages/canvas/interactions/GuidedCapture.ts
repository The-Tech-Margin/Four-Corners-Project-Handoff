/**
 * @module interactions/GuidedCapture
 * Step-by-step guided workflow for structured content creation.
 * Includes persona-specific preset step sequences.
 */

/** A single step in a guided capture workflow. */
export interface CaptureStep {
  /** Unique step identifier. */
  id: string;
  /** Type of content to add in this step. */
  type: 'add-photo' | 'record-voice' | 'add-text' | 'add-link' | 'add-video';
  /** Prompt text shown to the user. */
  prompt: string;
  /** Which zone the resulting shape should land in. */
  zone?: string;
  /** Whether this step must be completed. */
  required?: boolean;
  /** Whether this step has been completed. */
  completed?: boolean;
}

/**
 * Manages a sequential guided capture workflow.
 * Steps can be completed, skipped, or navigated directly.
 */
export class GuidedCapture {
  /** The steps in this workflow. */
  steps: CaptureStep[];

  /** Index of the current step. */
  currentStepIndex = 0;

  /** Callback fired when the current step changes. */
  onStepChange?: (step: CaptureStep, index: number) => void;

  /**
   * @param steps - Array of capture steps defining the workflow.
   */
  constructor(steps: CaptureStep[]) {
    this.steps = steps.map((s) => ({ ...s }));
  }

  /**
   * Get the current step, or null if the workflow is complete.
   */
  getCurrentStep(): CaptureStep | null {
    if (this.currentStepIndex >= this.steps.length) return null;
    return this.steps[this.currentStepIndex];
  }

  /**
   * Mark the current step as completed and advance to the next.
   * @param _shapeId - The ID of the shape created for this step.
   */
  completeStep(_shapeId: string): void {
    if (this.currentStepIndex >= this.steps.length) return;
    this.steps[this.currentStepIndex].completed = true;
    this.currentStepIndex++;
    this.notifyChange();
  }

  /**
   * Skip the current step without completing it and advance.
   */
  skipStep(): void {
    if (this.currentStepIndex >= this.steps.length) return;
    this.currentStepIndex++;
    this.notifyChange();
  }

  /**
   * Jump to a specific step index.
   * @param index - The step index to navigate to.
   */
  goToStep(index: number): void {
    if (index >= 0 && index < this.steps.length) {
      this.currentStepIndex = index;
      this.notifyChange();
    }
  }

  /**
   * Whether all steps have been visited (index past end).
   */
  isComplete(): boolean {
    return this.currentStepIndex >= this.steps.length;
  }

  /**
   * Get workflow progress.
   */
  getProgress(): { completed: number; total: number; percentage: number } {
    const completed = this.steps.filter((s) => s.completed).length;
    const total = this.steps.length;
    return {
      completed,
      total,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  /**
   * Reset all steps to uncompleted and go back to the first step.
   */
  reset(): void {
    this.currentStepIndex = 0;
    for (const step of this.steps) {
      step.completed = false;
    }
    this.notifyChange();
  }

  private notifyChange(): void {
    const step = this.getCurrentStep();
    if (step) {
      this.onStepChange?.(step, this.currentStepIndex);
    }
  }
}

// ── Preset step sequences ──

/** Citizen journalist / witness workflow. */
export const WITNESS_STEPS: CaptureStep[] = [
  { id: 'w1', type: 'add-photo', prompt: 'Add your photograph', zone: 'center', required: true },
  { id: 'w2', type: 'record-voice', prompt: 'Describe what you witnessed', zone: 'backstory' },
  { id: 'w3', type: 'add-text', prompt: 'When and where was this taken?', zone: 'authorship', required: true },
  { id: 'w4', type: 'add-link', prompt: 'Link to related coverage', zone: 'links' },
  { id: 'w5', type: 'add-photo', prompt: 'Add any related images', zone: 'related-imagery' },
];

/** Professional journalist on deadline — fewer steps. */
export const DEADLINE_STEPS: CaptureStep[] = [
  { id: 'd1', type: 'add-photo', prompt: 'Main photograph', zone: 'center', required: true },
  { id: 'd2', type: 'add-text', prompt: 'Caption and credit', zone: 'authorship', required: true },
  { id: 'd3', type: 'add-link', prompt: 'Publication link', zone: 'links' },
];

/** NGO / fieldwork documentation workflow. */
export const FIELDWORK_STEPS: CaptureStep[] = [
  { id: 'f1', type: 'add-photo', prompt: 'Primary documentation image', zone: 'center', required: true },
  { id: 'f2', type: 'add-text', prompt: 'Detailed caption with consent information', zone: 'authorship', required: true },
  { id: 'f3', type: 'record-voice', prompt: 'Field notes and context', zone: 'backstory' },
  { id: 'f4', type: 'add-photo', prompt: 'Related documentation', zone: 'related-imagery' },
  { id: 'f5', type: 'add-link', prompt: 'Organization and project links', zone: 'links', required: true },
];

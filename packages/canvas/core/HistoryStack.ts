/**
 * @module core/HistoryStack
 * Command-pattern undo/redo system.
 */

/** A reversible command for the history stack. */
export interface Command {
  /** Execute the command. */
  execute(): void;
  /** Reverse the command. */
  undo(): void;
  /** Human-readable description of the command. */
  description: string;
}

/**
 * Manages an undo/redo stack using the command pattern.
 * Each action is wrapped in a Command with execute() and undo() methods.
 */
export class HistoryStack {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxSize: number;

  /**
   * @param maxSize - Maximum number of commands to retain (default 50).
   */
  constructor(maxSize = 50) {
    this.maxSize = maxSize;
  }

  /**
   * Execute a command and push it onto the undo stack.
   * Clears the redo stack (no redo after a new action).
   * @param command - The command to execute.
   */
  push(command: Command): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = [];

    // Trim if exceeding max size
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
  }

  /**
   * Undo the last command.
   */
  undo(): void {
    const command = this.undoStack.pop();
    if (!command) return;
    command.undo();
    this.redoStack.push(command);
  }

  /**
   * Redo the last undone command.
   */
  redo(): void {
    const command = this.redoStack.pop();
    if (!command) return;
    command.execute();
    this.undoStack.push(command);
  }

  /** Whether there are commands to undo. */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Whether there are commands to redo. */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Clear both stacks. */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Get descriptions of all commands in the undo stack.
   * @returns Array of description strings (oldest first).
   */
  getHistory(): string[] {
    return this.undoStack.map((c) => c.description);
  }
}

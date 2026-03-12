import { type TaskPriority, type TaskStatus } from './taskBoardConfig';

type TaskQuickControlsProps = {
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  disabled?: boolean;
  showStatus?: boolean;
  compact?: boolean;
  onStatusChange: (status: TaskStatus) => void;
  onPriorityChange: (priority: TaskPriority) => void;
  onDueDateChange: (dueDate: string | null) => void;
};

export function TaskQuickControls({
  status,
  priority,
  dueDate,
  disabled = false,
  showStatus = true,
  compact = false,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
}: TaskQuickControlsProps) {
  const controlClasses = compact
    ? 'rounded border border-slate-300 bg-white px-2 py-1 text-xs'
    : 'rounded border border-slate-300 bg-white px-2 py-1.5 text-xs';

  return (
    <div className={`mt-3 flex flex-wrap items-center gap-2 ${disabled ? 'opacity-60' : ''}`}>
      {showStatus ? (
        <select
          value={status}
          onChange={(event) => onStatusChange(event.target.value as TaskStatus)}
          className={controlClasses}
          disabled={disabled}
        >
          <option value="todo">todo</option>
          <option value="in_progress">in_progress</option>
          <option value="done">done</option>
        </select>
      ) : null}

      <select
        value={priority}
        onChange={(event) => onPriorityChange(event.target.value as TaskPriority)}
        className={controlClasses}
        disabled={disabled}
      >
        <option value="urgent">urgent</option>
        <option value="high">high</option>
        <option value="medium">medium</option>
        <option value="low">low</option>
      </select>

      <input
        type="date"
        value={dueDate ?? ''}
        onChange={(event) => onDueDateChange(event.target.value || null)}
        className={controlClasses}
        disabled={disabled}
      />
    </div>
  );
}

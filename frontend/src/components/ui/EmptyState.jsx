// components/ui/EmptyState.jsx
export default function EmptyState({ icon, title, subtitle, action }) {
  return (
    <div className="text-center py-16 px-4">
      <p className="text-4xl mb-4">{icon}</p>
      <p className="font-semibold text-gray-700 mb-1">{title}</p>
      <p className="text-sm text-gray-400 mb-6">{subtitle}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-xl transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

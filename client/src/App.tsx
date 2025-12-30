import { useEffect, useState } from 'react';
import './index.css';

interface Habit {
  id: number;
  name: string;
  streak: number;
  completed_today: boolean;
  last_completed_date: string | null;
}

const API_URL = 'http://localhost:3000/api/habits';

function App() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [newHabitName, setNewHabitName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHabits();
  }, []);

  const fetchHabits = async () => {
    try {
      const res = await fetch(API_URL);
      if (res.ok) {
        const data = await res.json();
        // Optimistically sort: active/completed -> but usually we just list
        setHabits(data);
      }
    } catch (err) {
      console.error("Failed to fetch habits", err);
    } finally {
      setLoading(false);
    }
  };

  const addHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHabitName.trim()) return;

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newHabitName })
      });

      if (res.ok) {
        const habit = await res.json();
        setHabits([...habits, habit]);
        setNewHabitName('');
      }
    } catch (err) {
      console.error("Failed to add habit", err);
    }
  };

  const toggleHabit = async (id: number) => {
    // Optimistic Update
    const oldHabits = [...habits];
    const updatedHabits = habits.map(h => {
      if (h.id === id) {
        const wasCompleted = h.completed_today;
        return {
          ...h,
          completed_today: !wasCompleted,
          streak: !wasCompleted
            ? h.streak + 1 // Assuming simplistic increment for visual feedback
            : Math.max(0, h.streak - 1)
        };
      }
      return h;
    });
    setHabits(updatedHabits);

    try {
      const res = await fetch(`${API_URL}/${id}/toggle`, { method: 'PATCH' });
      if (res.ok) {
        const updatedHabit = await res.json();
        // Sync with server truth
        setHabits(prev => prev.map(h => h.id === id ? updatedHabit : h));
      } else {
        // Revert on failure
        setHabits(oldHabits);
      }
    } catch (err) {
      setHabits(oldHabits);
    }
  };

  const deleteHabit = async (id: number) => {
    if (!confirm("Delete this habit?")) return;

    try {
      setHabits(habits.filter(h => h.id !== id)); // Optimistic
      await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
    } catch (err) {
      fetchHabits(); // Revert/Refresh
    }
  };

  return (
    <div className="container">
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: '1rem',
        borderBottom: '2px solid var(--color-primary)'
      }}>
        <h1>Habits</h1>
        <div style={{
          background: 'var(--color-primary)',
          padding: '0.5rem 1rem',
          borderRadius: '20px',
          fontSize: '0.9rem',
          fontWeight: 'bold'
        }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </div>
      </header>

      <form onSubmit={addHabit} style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          placeholder="New habit..."
          value={newHabitName}
          onChange={(e) => setNewHabitName(e.target.value)}
          style={{ flex: 1 }}
        />
        <button
          type="submit"
          style={{
            background: 'var(--color-text-main)',
            color: 'var(--color-bg)',
            padding: '0 1.5rem',
            borderRadius: 'var(--radius)',
            fontWeight: 'bold'
          }}
        >
          Add
        </button>
      </form>

      {loading ? (
        <div style={{ textAlign: 'center', color: '#999' }}>Loading...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {habits.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
              No habits yet. Start a streak today!
            </div>
          )}
          {habits.map((habit) => (
            <div
              key={habit.id}
              className="card animate-enter"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderLeft: habit.completed_today ? '6px solid var(--color-primary)' : '6px solid transparent',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button
                  onClick={() => toggleHabit(habit.id)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    border: habit.completed_today ? 'none' : '2px solid #ddd',
                    background: habit.completed_today ? 'var(--color-primary)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.2rem'
                  }}
                >
                  {habit.completed_today && '✓'}
                </button>

                <div>
                  <h3 style={{
                    textDecoration: habit.completed_today ? 'line-through' : 'none',
                    color: habit.completed_today ? '#999' : 'inherit'
                  }}>
                    {habit.name}
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: '#666' }}>
                    🔥 {habit.streak} day streak
                  </span>
                </div>
              </div>

              <button
                onClick={() => deleteHabit(habit.id)}
                style={{
                  background: 'none',
                  color: '#ddd',
                  fontSize: '1.5rem',
                  padding: '0 0.5rem'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'red'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#ddd'}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;

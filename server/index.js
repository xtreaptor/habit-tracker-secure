const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs').promises;
const path = require('path');
const { z } = require('zod');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'habits.json');

// ==========================================
// SECURITY MIDDLEWARE
// ==========================================

app.use(helmet());
app.use(cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
});
app.use(limiter);
app.use(express.json({ limit: '10kb' }));

// ==========================================
// FILE PERSISTENCE HELPERS
// ==========================================

async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            await writeData([]);
            return [];
        }
        throw err;
    }
}

async function writeData(data) {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

// ==========================================
// VALIDATION SCHEMAS
// ==========================================

const habitSchema = z.object({
    name: z.string().min(1, "Habit name is required").max(50, "Habit name too long").trim(),
});

// ==========================================
// ROUTES
// ==========================================

// GET /api/habits
app.get('/api/habits', async (req, res) => {
    try {
        const habits = await readData();
        res.json(habits);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/habits
app.post('/api/habits', async (req, res) => {
    try {
        const validation = habitSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: validation.error.errors });
        }

        const { name } = validation.data;
        const habits = await readData();

        const newHabit = {
            id: Date.now(), // Simple ID generation
            name,
            streak: 0,
            completed_today: false,
            last_completed_date: null
        };

        habits.push(newHabit);
        await writeData(habits);

        res.status(201).json(newHabit);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PATCH /api/habits/:id/toggle
app.patch('/api/habits/:id/toggle', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const habits = await readData();
        const habitIndex = habits.findIndex(h => h.id === id);

        if (habitIndex === -1) {
            return res.status(404).json({ error: 'Habit not found' });
        }

        const habit = habits[habitIndex];
        const today = new Date().toISOString().split('T')[0];

        let newCompletedToday = !habit.completed_today;
        let newStreak = habit.streak;
        let newLastDate = habit.last_completed_date;

        if (newCompletedToday) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            if (habit.last_completed_date === yesterdayStr) {
                newStreak += 1;
            } else if (habit.last_completed_date !== today) {
                newStreak = 1;
            }
            newLastDate = today;
        } else {
            if (habit.last_completed_date === today) {
                if (newStreak > 0) newStreak -= 1;
                newLastDate = null;
            }
        }

        habits[habitIndex] = {
            ...habit,
            completed_today: newCompletedToday,
            streak: newStreak,
            last_completed_date: newLastDate
        };

        await writeData(habits);
        res.json(habits[habitIndex]);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// DELETE /api/habits/:id
app.delete('/api/habits/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const habits = await readData();
        const filteredHabits = habits.filter(h => h.id !== id);

        await writeData(filteredHabits);
        res.status(204).send();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running (JSON Mode) on http://localhost:${PORT}`);
});

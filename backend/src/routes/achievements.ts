/**
 * @file achievements.ts
 * @description 成就系统接口
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();
router.use(authenticateToken);

const calculateCheckinStreak = (userId: string): number => {
  const rows = db.prepare(`
    SELECT checkin_date
    FROM reading_checkins
    WHERE user_id = ?
    ORDER BY checkin_date DESC
    LIMIT 365
  `).all(userId) as Array<{ checkin_date: string }>;

  const set = new Set(rows.map((r) => r.checkin_date));
  let streak = 0;
  for (let d = new Date(), i = 0; i < 365; i++) {
    const key = d.toISOString().slice(0, 10);
    if (set.has(key)) streak++;
    else if (i > 0) break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
};

const unlockAchievement = (userId: string, key: string) => {
  const achievement = db.prepare('SELECT id FROM achievements WHERE key = ?').get(key) as { id: string } | undefined;
  if (!achievement) return false;

  const existing = db.prepare(`
    SELECT id FROM user_achievements WHERE user_id = ? AND achievement_id = ?
  `).get(userId, achievement.id) as { id: string } | undefined;

  if (existing) return false;

  db.prepare(`
    INSERT INTO user_achievements (id, user_id, achievement_id)
    VALUES (?, ?, ?)
  `).run(uuidv4(), userId, achievement.id);
  return true;
};

const checkAndUnlockAchievements = (userId: string) => {
  const messageCount = (db.prepare('SELECT COUNT(*) as count FROM messages WHERE from_user_id = ?')
    .get(userId) as { count: number }).count || 0;
  const checkinCount = (db.prepare('SELECT COUNT(*) as count FROM reading_checkins WHERE user_id = ?')
    .get(userId) as { count: number }).count || 0;
  const finishedBooks = (db.prepare('SELECT COUNT(*) as count FROM reading_progress WHERE user_id = ? AND progress >= 1')
    .get(userId) as { count: number }).count || 0;
  const streak = calculateCheckinStreak(userId);

  if (messageCount >= 1) unlockAchievement(userId, 'first_message');
  if (messageCount >= 100) unlockAchievement(userId, 'chatty_100');
  if (checkinCount >= 1) unlockAchievement(userId, 'first_checkin');
  if (streak >= 7) unlockAchievement(userId, 'streak_7');
  if (finishedBooks >= 10) unlockAchievement(userId, 'bookworm_10');

  return {
    messageCount,
    checkinCount,
    streak,
    finishedBooks
  };
};

router.get('/', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const stats = checkAndUnlockAchievements(userId);

    const rows = db.prepare(`
      SELECT a.id, a.key, a.name, a.description, a.icon, a.points,
             ua.unlocked_at
      FROM achievements a
      LEFT JOIN user_achievements ua
        ON ua.achievement_id = a.id AND ua.user_id = ?
      ORDER BY a.points DESC, a.name ASC
    `).all(userId) as Array<{
      id: string;
      key: string;
      name: string;
      description: string;
      icon?: string;
      points: number;
      unlocked_at?: string;
    }>;

    const achievements = rows.map(row => ({
      ...row,
      unlocked: !!row.unlocked_at
    }));

    const unlockedCount = achievements.filter(a => a.unlocked).length;
    const totalPoints = achievements.reduce((sum, a) => sum + (a.unlocked ? (a.points || 0) : 0), 0);

    res.json({
      achievements,
      stats: {
        ...stats,
        totalAchievements: achievements.length,
        unlockedCount,
        totalPoints
      }
    });
  } catch (e: any) {
    console.error('获取成就失败:', e);
    res.status(500).json({ error: '获取成就失败' });
  }
});

export default router;

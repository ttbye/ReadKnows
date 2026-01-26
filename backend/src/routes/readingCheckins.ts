/**
 * @file readingCheckins.ts
 * @description 读书打卡接口
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();
router.use(authenticateToken);

const today = () => new Date().toISOString().slice(0, 10);

// 今日打卡
router.post('/', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { bookId, durationMinutes, note } = req.body || {};
    const date = today();

    const existing = db.prepare(
      'SELECT id FROM reading_checkins WHERE user_id = ? AND checkin_date = ?'
    ).get(userId, date) as any;

    if (existing) {
      // 更新
      db.prepare(`
        UPDATE reading_checkins
        SET book_id = ?, duration_minutes = COALESCE(?, duration_minutes), note = ?, created_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(bookId || null, durationMinutes ?? 0, note || null, existing.id);
      return res.json({ ok: true, message: '已更新今日打卡', date });
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO reading_checkins (id, user_id, checkin_date, book_id, duration_minutes, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userId, date, bookId || null, durationMinutes ?? 0, note || null);

    res.json({ ok: true, message: '打卡成功', date });
  } catch (e: any) {
    console.error('读书打卡失败:', e);
    res.status(500).json({ error: '打卡失败' });
  }
});

// 打卡列表/日历
router.get('/', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const from = (req.query.from as string) || today();
    const to = (req.query.to as string) || today();
    const limit = Math.min(parseInt(String(req.query.limit || '90'), 10), 365);

    const rows = db.prepare(`
      SELECT id, checkin_date, book_id, duration_minutes, note, created_at
      FROM reading_checkins
      WHERE user_id = ?
      ORDER BY checkin_date DESC
      LIMIT ?
    `).all(userId, limit) as any[];

    // 连续打卡天数：从今天往过去数
    let streak = 0;
    const set = new Set(rows.map((r) => r.checkin_date));
    for (let d = new Date(), i = 0; i < 365; i++) {
      const key = d.toISOString().slice(0, 10);
      if (set.has(key)) streak++;
      else if (i > 0) break;
      d.setDate(d.getDate() - 1);
    }

    res.json({
      checkins: rows,
      streak,
      total: rows.length,
    });
  } catch (e: any) {
    console.error('获取打卡记录失败:', e);
    res.status(500).json({ error: '获取失败' });
  }
});

// 今日是否已打卡
router.get('/today', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const row = db.prepare(
      'SELECT id, checkin_date, book_id, duration_minutes, note FROM reading_checkins WHERE user_id = ? AND checkin_date = ?'
    ).get(userId, today()) as any;
    res.json({ checked: !!row, record: row || null });
  } catch (e: any) {
    console.error('查询今日打卡失败:', e);
    res.status(500).json({ error: '查询失败' });
  }
});

export default router;

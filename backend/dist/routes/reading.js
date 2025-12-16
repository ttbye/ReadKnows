"use strict";
/**
 * @file reading.ts
 * @author ttbye
 * @date 2025-12-11
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const uuid_1 = require("uuid");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
// 获取当前 UTC 时间的 ISO 8601 格式字符串
const getCurrentUTCTime = () => new Date().toISOString();
const router = express_1.default.Router();
// 更新阅读进度（带冲突检测）
router.post('/progress', auth_1.authenticateToken, async (req, res) => {
    try {
        console.log('📥 收到保存进度请求:', {
            userId: req.userId,
            bookId: req.body.bookId,
            progress: req.body.progress,
            progressType: typeof req.body.progress,
            currentPage: req.body.currentPage,
            totalPages: req.body.totalPages,
            chapterIndex: req.body.chapterIndex,
            hasCurrentPosition: !!req.body.currentPosition,
        });
        const { bookId, progress, currentPosition, currentPage, totalPages, chapterIndex, scrollTop, clientTimestamp, force } = req.body;
        const userId = req.userId;
        // 数据验证和类型转换
        if (!bookId || progress === undefined) {
            return res.status(400).json({ error: '请提供书籍ID和阅读进度' });
        }
        // 确保 progress 是数字类型
        const progressValue = typeof progress === 'number' ? progress : parseFloat(progress);
        if (isNaN(progressValue) || progressValue < 0 || progressValue > 1) {
            return res.status(400).json({ error: '阅读进度必须是 0 到 1 之间的数字' });
        }
        // 确保其他数值字段也是正确的类型
        const safeCurrentPage = currentPage ? parseInt(String(currentPage), 10) : 1;
        const safeTotalPages = totalPages ? parseInt(String(totalPages), 10) : 1;
        const safeChapterIndex = chapterIndex !== undefined ? parseInt(String(chapterIndex), 10) : 0;
        const safeScrollTop = scrollTop ? parseFloat(String(scrollTop)) : 0;
        // 验证 user_id 和 book_id 是否存在（避免外键约束错误）
        // 注意：用户验证应该在认证中间件中完成，这里只是双重检查
        const userExists = db_1.db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
        if (!userExists) {
            console.error('用户不存在（应该在认证中间件中被拦截）:', userId);
            return res.status(401).json({ error: '用户不存在，请重新登录' });
        }
        const bookExists = db_1.db.prepare('SELECT id FROM books WHERE id = ?').get(bookId);
        if (!bookExists) {
            console.error('书籍不存在:', bookId);
            return res.status(400).json({ error: '书籍不存在' });
        }
        // 检查是否已有进度记录
        const existing = db_1.db
            .prepare('SELECT * FROM reading_progress WHERE user_id = ? AND book_id = ?')
            .get(userId, bookId);
        if (existing && !force) {
            // 检查冲突：如果服务器上的进度更新时间比客户端时间新，说明有其他设备更新了进度
            const serverUpdatedAt = new Date(existing.updated_at).getTime();
            const clientTime = clientTimestamp ? new Date(clientTimestamp).getTime() : Date.now();
            // 如果服务器进度更新且进度值更大，可能存在冲突
            // 或者服务器更新时间比客户端时间新超过5秒（允许网络延迟）
            const timeDiff = serverUpdatedAt - clientTime;
            const hasConflict = timeDiff > 5000 && existing.progress > progressValue;
            if (hasConflict) {
                // 返回冲突信息，让客户端决定
                return res.status(409).json({
                    error: '进度冲突',
                    conflict: true,
                    serverProgress: {
                        progress: existing.progress,
                        currentPage: existing.current_page || 1,
                        totalPages: existing.total_pages || 1,
                        chapterIndex: existing.chapter_index || 0,
                        scrollTop: existing.scroll_top || 0,
                        updatedAt: existing.updated_at,
                    },
                    clientProgress: {
                        progress: progressValue,
                        currentPage: safeCurrentPage,
                        totalPages: safeTotalPages,
                        chapterIndex: safeChapterIndex,
                        scrollTop: safeScrollTop,
                    },
                });
            }
            // 更新进度（使用最新的时间戳）
            try {
                // 限制 currentPosition 长度（SQLite TEXT 理论上无限制，但为安全起见限制长度）
                const maxCfiLength = 10000; // 10KB 应该足够存储 CFI
                const safeCurrentPosition = currentPosition && currentPosition.length > maxCfiLength
                    ? currentPosition.substring(0, maxCfiLength)
                    : (currentPosition || null);
                const updateStmt = db_1.db.prepare(`
        UPDATE reading_progress 
        SET progress = ?, 
            current_position = ?, 
            current_page = ?,
            total_pages = ?,
            chapter_index = ?,
            scroll_top = ?,
            last_read_at = ?, 
            updated_at = ?
        WHERE user_id = ? AND book_id = ?
        `);
                const now = getCurrentUTCTime();
                const result = updateStmt.run(progressValue, safeCurrentPosition, safeCurrentPage, safeTotalPages, safeChapterIndex, safeScrollTop, now, now, userId, bookId);
                if (result.changes === 0) {
                    throw new Error('更新失败：没有记录被更新');
                }
            }
            catch (updateError) {
                console.error('更新阅读进度失败:', updateError);
                console.error('更新参数:', {
                    userId,
                    bookId,
                    progress: progressValue,
                    progressType: typeof progress,
                    currentPositionLength: currentPosition?.length || 0,
                    currentPage: safeCurrentPage,
                    totalPages: safeTotalPages,
                    chapterIndex: safeChapterIndex,
                });
                throw new Error(`更新进度失败: ${updateError.message}`);
            }
        }
        else {
            // 创建新进度记录
            try {
                // 限制 currentPosition 长度
                const maxCfiLength = 10000;
                const safeCurrentPosition = currentPosition && currentPosition.length > maxCfiLength
                    ? currentPosition.substring(0, maxCfiLength)
                    : (currentPosition || null);
                const progressId = (0, uuid_1.v4)();
                const insertStmt = db_1.db.prepare(`
        INSERT INTO reading_progress (
          id, user_id, book_id, progress, current_position, 
          current_page, total_pages, chapter_index, scroll_top
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
                insertStmt.run(progressId, userId, bookId, progressValue, safeCurrentPosition, safeCurrentPage, safeTotalPages, safeChapterIndex, safeScrollTop);
            }
            catch (insertError) {
                console.error('创建阅读进度失败:', insertError);
                console.error('插入参数:', {
                    userId,
                    bookId,
                    progress: progressValue,
                    progressType: typeof progress,
                    currentPositionLength: currentPosition?.length || 0,
                    currentPage: safeCurrentPage,
                    totalPages: safeTotalPages,
                    chapterIndex: safeChapterIndex,
                });
                // 如果是外键约束错误，提供更详细的错误信息
                if (insertError.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
                    console.error('外键约束失败 - 检查用户和书籍是否存在:');
                    const userCheck = db_1.db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
                    const bookCheck = db_1.db.prepare('SELECT id, title FROM books WHERE id = ?').get(bookId);
                    console.error('用户检查:', userCheck ? '存在' : '不存在', userCheck);
                    console.error('书籍检查:', bookCheck ? '存在' : '不存在', bookCheck);
                    return res.status(400).json({
                        error: '外键约束失败',
                        details: {
                            userExists: !!userCheck,
                            bookExists: !!bookCheck,
                        }
                    });
                }
                throw new Error(`创建进度失败: ${insertError.message}`);
            }
        }
        // 记录阅读历史（每次翻页/进度变化时自动记录阅读时长）
        // 注意：此时 reading_progress 已经更新完成，可以直接读取
        let actualProgress = progressValue; // 默认使用传入的进度值
        try {
            // 先检查是否已存在记录
            const existingHistory = db_1.db
                .prepare('SELECT id, total_progress, last_read_at FROM reading_history WHERE user_id = ? AND book_id = ?')
                .get(userId, bookId);
            // 从 reading_progress 表获取最新的实际进度（此时已经更新完成）
            const currentProgressRecord = db_1.db
                .prepare('SELECT progress, chapter_index FROM reading_progress WHERE user_id = ? AND book_id = ?')
                .get(userId, bookId);
            // ⚠️ 重要：优先使用传入的 progressValue（前端已根据章节计算）
            // 如果 reading_progress 表中的 progress 有值且更大，则使用它（确保进度不会倒退）
            let calculatedProgress = progressValue;
            if (currentProgressRecord) {
                if (currentProgressRecord.progress !== undefined && currentProgressRecord.progress !== null && currentProgressRecord.progress > 0) {
                    // 使用较大的进度值（确保进度不会倒退）
                    calculatedProgress = Math.max(currentProgressRecord.progress, progressValue);
                }
                else {
                    // 如果 progress 为 0 或 null，使用传入的 progressValue（前端已根据章节计算）
                    calculatedProgress = progressValue;
                }
            }
            actualProgress = calculatedProgress;
            console.log('📊 阅读历史 - 进度值:', {
                progressValue,
                currentProgressRecord: currentProgressRecord?.progress,
                actualProgress,
                hasExistingHistory: !!existingHistory,
                historyId: existingHistory?.id,
            });
            let historyId;
            const now = new Date();
            const nowTime = now.getTime();
            if (existingHistory) {
                historyId = existingHistory.id;
                // 更新最后阅读时间和总进度（使用更大的进度值）
                // actualProgress 应该已经是从前端传来的根据章节计算的进度值
                // 如果仍然为 0，尝试根据章节索引计算（需要知道总章节数，这里暂时使用传入的 progressValue）
                if ((actualProgress === 0 || actualProgress === null || actualProgress === undefined) && progressValue > 0) {
                    actualProgress = progressValue;
                    console.log('📊 使用传入的进度值:', { progressValue, actualProgress });
                }
                const currentTotalProgress = existingHistory.total_progress !== null && existingHistory.total_progress !== undefined
                    ? existingHistory.total_progress
                    : 0;
                const newProgress = Math.max(currentTotalProgress, actualProgress);
                const oldLastReadAt = existingHistory.last_read_at;
                // ⚠️ 重要：先计算 duration，再更新 last_read_at
                // 否则下次请求时 oldLastReadAt 已经是新时间，duration 会变成 0
                let duration = 0;
                if (oldLastReadAt) {
                    const lastReadTime = new Date(oldLastReadAt).getTime();
                    duration = Math.floor((nowTime - lastReadTime) / 1000); // 秒
                }
                // 现在更新 last_read_at（在计算 duration 之后）
                const nowUTC = getCurrentUTCTime();
                const updateHistoryResult = db_1.db.prepare(`
          UPDATE reading_history 
          SET last_read_at = ?,
              total_progress = ?,
              updated_at = ?
          WHERE user_id = ? AND book_id = ?
        `).run(nowUTC, newProgress, nowUTC, userId, bookId);
                console.log('✅ 更新阅读历史进度:', {
                    historyId,
                    oldProgress: currentTotalProgress,
                    newProgress,
                    actualProgress,
                    progressValue,
                    updated: updateHistoryResult.changes,
                    oldLastReadAt,
                    now: now.toISOString(),
                    duration,
                });
                // 每次翻页/进度变化时记录阅读时长
                // 计算从上次保存进度到现在的时长
                if (oldLastReadAt) {
                    console.log('⏱️ 计算阅读时长:', {
                        historyId,
                        oldLastReadAt,
                        now: now.toISOString(),
                        duration,
                        durationMinutes: (duration / 60).toFixed(2),
                        durationHours: (duration / 3600).toFixed(2),
                    });
                    // 如果时长大于等于1秒，才记录会话（降低阈值，确保快速翻页也能记录）
                    // 同时限制最大时长为2小时（防止异常情况）
                    // 注意：即使时长不足，也要更新 last_read_at 和 total_progress
                    if (duration >= 1 && duration <= 7200) {
                        // 检查是否有未结束的会话（活跃会话）
                        const activeSession = db_1.db
                            .prepare(`
                SELECT id, start_time, progress_before FROM reading_sessions 
                WHERE history_id = ? AND end_time IS NULL 
                ORDER BY start_time DESC LIMIT 1
              `)
                            .get(historyId);
                        if (activeSession) {
                            // 更新现有活跃会话：累计时长，更新进度（不结束会话，继续累计）
                            const sessionStartTime = new Date(activeSession.start_time).getTime();
                            const totalDuration = Math.floor((nowTime - sessionStartTime) / 1000);
                            // 计算本次增量（从上次保存到现在）
                            const incrementalDuration = duration;
                            // 只更新会话的时长和进度，不结束会话（继续累计）
                            // ⚠️ 重要：不在这里累计 total_reading_time，只在结束会话时累计，避免重复累计
                            db_1.db.prepare(`
                UPDATE reading_sessions
                SET duration = ?,
                    progress_after = ?
                WHERE id = ?
              `).run(totalDuration, actualProgress, activeSession.id);
                            console.log('📖 更新活跃会话时长（不累计总时长）:', {
                                historyId,
                                sessionId: activeSession.id,
                                incrementalDuration,
                                totalDuration,
                                note: '总时长将在结束会话时累计',
                            });
                        }
                        else {
                            // 没有活跃会话，创建新会话（这种情况不应该发生，因为打开书籍时应该已经创建了会话）
                            // 但为了容错，还是创建新会话
                            console.warn('⚠️ 没有活跃会话，创建新会话（这不应该发生）:', {
                                historyId,
                                duration,
                            });
                            const sessionId = (0, uuid_1.v4)();
                            db_1.db.prepare(`
                INSERT INTO reading_sessions (
                  id, history_id, user_id, book_id, start_time, progress_before
                )
                VALUES (?, ?, ?, ?, ?, ?)
              `).run(sessionId, historyId, userId, bookId, actualProgress);
                            // 不更新 read_count，因为会话还没有结束
                            // read_count 只在会话结束时增加
                        }
                    }
                    else if (duration > 7200) {
                        // 时长超过2小时，可能是异常情况（比如关闭了应用很久才打开）
                        // 不累计时长，但结束旧的活跃会话，创建新的活跃会话
                        console.log('⏰ 阅读间隔过长，跳过时长累计:', {
                            duration,
                            hours: (duration / 3600).toFixed(2),
                            historyId,
                        });
                        // 结束所有旧的活跃会话（避免数据异常）
                        const endTimeUTC = getCurrentUTCTime();
                        db_1.db.prepare(`
              UPDATE reading_sessions
              SET end_time = ?,
                  duration = 0,
                  progress_after = ?
              WHERE history_id = ? AND end_time IS NULL
            `).run(endTimeUTC, actualProgress, historyId);
                        // 创建新的活跃会话（为下次翻页准备）
                        const newSessionId = (0, uuid_1.v4)();
                        db_1.db.prepare(`
              INSERT INTO reading_sessions (
                id, history_id, user_id, book_id, start_time, progress_before
              )
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(newSessionId, historyId, userId, bookId, actualProgress);
                    }
                    else if (duration === 0) {
                        // duration 为 0，可能是同一秒内的多次请求
                        // 检查是否有活跃会话，如果有就更新它，如果没有就创建一个
                        const activeSession = db_1.db
                            .prepare(`
                SELECT id, start_time FROM reading_sessions 
                WHERE history_id = ? AND end_time IS NULL 
                ORDER BY start_time DESC LIMIT 1
              `)
                            .get(historyId);
                        if (!activeSession) {
                            // 创建新的活跃会话（为下次翻页准备）
                            const newSessionId = (0, uuid_1.v4)();
                            db_1.db.prepare(`
                INSERT INTO reading_sessions (
                  id, history_id, user_id, book_id, start_time, progress_before
                )
                VALUES (?, ?, ?, ?, ?, ?)
              `).run(newSessionId, historyId, userId, bookId, actualProgress);
                            console.log('📝 duration=0，创建新的活跃会话:', {
                                historyId,
                                sessionId: newSessionId,
                            });
                        }
                    }
                    else {
                        // 时长不足1秒，但也要累计阅读时长（即使是0.5秒也算阅读）
                        if (duration > 0 && duration < 1) {
                            // 检查是否有活跃会话
                            const activeSession = db_1.db
                                .prepare(`
                  SELECT id, start_time FROM reading_sessions 
                  WHERE history_id = ? AND end_time IS NULL 
                  ORDER BY start_time DESC LIMIT 1
                `)
                                .get(historyId);
                            if (activeSession) {
                                // 更新活跃会话的时长（累计）
                                const sessionStartTime = new Date(activeSession.start_time).getTime();
                                const totalDuration = Math.floor((nowTime - sessionStartTime) / 1000);
                                // 更新会话时长和进度
                                db_1.db.prepare(`
                  UPDATE reading_sessions
                  SET duration = ?,
                      progress_after = ?
                  WHERE id = ?
                `).run(totalDuration, actualProgress, activeSession.id);
                                // ⚠️ 重要：不在这里累计 total_reading_time，只在结束会话时累计，避免重复累计
                                // 不更新 read_count，因为会话还在进行中
                                console.log('📖 更新会话时长（不累计总时长）:', {
                                    historyId,
                                    sessionId: activeSession.id,
                                    duration,
                                    note: '总时长将在结束会话时累计',
                                });
                            }
                            else {
                                // 没有活跃会话，创建新会话（即使时长很短）
                                const sessionId = (0, uuid_1.v4)();
                                db_1.db.prepare(`
                  INSERT INTO reading_sessions (
                    id, history_id, user_id, book_id, start_time, end_time, duration,
                    progress_before, progress_after
                  )
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(sessionId, historyId, userId, bookId, oldLastReadAt, duration, existingHistory.total_progress || 0, actualProgress);
                                // ⚠️ 重要：不在这里累计 total_reading_time，只在结束会话时累计，避免重复累计
                                // 不更新 read_count，因为会话还在进行中（这种情况不应该发生，因为应该有活跃会话）
                                console.log('📖 创建新会话（不累计总时长）:', {
                                    historyId,
                                    sessionId,
                                    duration,
                                    note: '总时长将在结束会话时累计',
                                });
                                // 创建新的活跃会话
                                const newSessionId = (0, uuid_1.v4)();
                                db_1.db.prepare(`
                  INSERT INTO reading_sessions (
                    id, history_id, user_id, book_id, start_time, progress_before
                  )
                  VALUES (?, ?, ?, ?, ?, ?)
                `).run(newSessionId, historyId, userId, bookId, actualProgress);
                            }
                        }
                        else {
                            // 时长=0或异常，只确保有活跃会话
                            const activeSession = db_1.db
                                .prepare(`
                  SELECT id FROM reading_sessions 
                  WHERE history_id = ? AND end_time IS NULL 
                  ORDER BY start_time DESC LIMIT 1
                `)
                                .get(historyId);
                            if (!activeSession) {
                                // 创建新的活跃会话（为下次翻页准备）
                                const newSessionId = (0, uuid_1.v4)();
                                db_1.db.prepare(`
                  INSERT INTO reading_sessions (
                    id, history_id, user_id, book_id, start_time, progress_before
                  )
                  VALUES (?, ?, ?, ?, ?, ?)
                `).run(newSessionId, historyId, userId, bookId, actualProgress);
                            }
                        }
                    }
                }
                else {
                    // 首次阅读，创建活跃会话
                    const sessionId = (0, uuid_1.v4)();
                    db_1.db.prepare(`
            INSERT INTO reading_sessions (
              id, history_id, user_id, book_id, start_time, progress_before
            )
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(sessionId, historyId, userId, bookId, getCurrentUTCTime(), actualProgress);
                }
            }
            else {
                // 创建新记录
                historyId = (0, uuid_1.v4)();
                try {
                    // 使用传入的 actualProgress（前端已根据章节计算）
                    // 如果 reading_progress 表中有更大的进度值，则使用它
                    const currentProgress = db_1.db
                        .prepare('SELECT progress FROM reading_progress WHERE user_id = ? AND book_id = ?')
                        .get(userId, bookId);
                    const finalProgress = currentProgress?.progress !== undefined && currentProgress?.progress !== null && currentProgress.progress > 0
                        ? Math.max(currentProgress.progress, actualProgress)
                        : actualProgress;
                    const nowUTC = getCurrentUTCTime();
                    db_1.db.prepare(`
            INSERT INTO reading_history (id, user_id, book_id, last_read_at, total_progress, read_count)
            VALUES (?, ?, ?, ?, ?, 0)
          `).run(historyId, userId, bookId, nowUTC, finalProgress);
                    // 创建首次阅读的活跃会话
                    const sessionId = (0, uuid_1.v4)();
                    db_1.db.prepare(`
            INSERT INTO reading_sessions (
              id, history_id, user_id, book_id, start_time, progress_before
            )
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(sessionId, historyId, userId, bookId, getCurrentUTCTime(), actualProgress);
                }
                catch (insertError) {
                    // 如果插入失败（可能是唯一约束冲突），尝试更新
                    if (insertError.message && insertError.message.includes('UNIQUE')) {
                        const existing = db_1.db
                            .prepare('SELECT id FROM reading_history WHERE user_id = ? AND book_id = ?')
                            .get(userId, bookId);
                        historyId = existing.id;
                        const nowUTC = getCurrentUTCTime();
                        db_1.db.prepare(`
              UPDATE reading_history 
              SET last_read_at = ?,
                  total_progress = ?,
                  updated_at = ?
              WHERE user_id = ? AND book_id = ?
            `).run(nowUTC, actualProgress, nowUTC, userId, bookId);
                    }
                    else {
                        throw insertError;
                    }
                }
            }
        }
        catch (historyError) {
            // 历史记录插入失败不影响进度保存，但需要详细记录错误
            console.error('❌ 记录阅读历史失败:', {
                error: historyError.message || historyError,
                stack: historyError.stack,
                userId,
                bookId,
                progressValue,
            });
        }
        // 最终验证：确保统计信息正确
        try {
            const finalHistory = db_1.db
                .prepare('SELECT total_reading_time, total_progress, read_count FROM reading_history WHERE user_id = ? AND book_id = ?')
                .get(userId, bookId);
            if (finalHistory) {
                console.log('📈 最终统计信息:', {
                    bookId,
                    total_reading_time: finalHistory.total_reading_time,
                    total_progress: finalHistory.total_progress,
                    read_count: finalHistory.read_count,
                });
            }
        }
        catch (e) {
            // 忽略验证错误
        }
        res.json({ message: '进度已更新' });
    }
    catch (error) {
        console.error('更新阅读进度错误:', error);
        console.error('错误详情:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
        });
        res.status(500).json({
            error: '更新失败',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});
// 获取阅读进度
router.get('/progress/:bookId', auth_1.authenticateToken, async (req, res) => {
    try {
        const { bookId } = req.params;
        const userId = req.userId;
        const progress = db_1.db
            .prepare('SELECT * FROM reading_progress WHERE user_id = ? AND book_id = ?')
            .get(userId, bookId);
        if (!progress) {
            return res.json({ progress: null });
        }
        // 返回完整的进度信息，供前端恢复阅读位置
        res.json({
            progress: {
                progress: progress.progress || 0,
                chapter_index: progress.chapter_index || 0,
                current_page: progress.current_page || 1,
                total_pages: progress.total_pages || 1,
                scroll_top: progress.scroll_top || 0,
                current_position: progress.current_position,
                last_read_at: progress.last_read_at,
                updated_at: progress.updated_at,
            },
        });
    }
    catch (error) {
        console.error('获取阅读进度错误:', error);
        res.status(500).json({ error: '获取失败' });
    }
});
// 获取所有阅读进度
router.get('/progress', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { limit = 20 } = req.query;
        const progresses = db_1.db
            .prepare(`
        SELECT 
          p.*,
          b.title,
          b.author,
          b.cover_url,
          b.file_type,
          b.id as book_id
        FROM reading_progress p
        JOIN books b ON p.book_id = b.id
        WHERE p.user_id = ? AND b.parent_book_id IS NULL
        ORDER BY p.last_read_at DESC
        LIMIT ?
      `)
            .all(userId, Number(limit));
        // 对于MOBI格式的书籍，优先使用EPUB版本的封面
        const processedProgresses = progresses.map((progress) => {
            if (progress.file_type && progress.file_type.toLowerCase() === 'mobi') {
                // 查找EPUB格式的版本
                const epubBook = db_1.db.prepare('SELECT * FROM books WHERE parent_book_id = ? AND file_type = ?').get(progress.book_id, 'epub');
                if (epubBook && epubBook.cover_url) {
                    // 使用EPUB版本的封面
                    progress.cover_url = epubBook.cover_url;
                }
            }
            return progress;
        });
        res.json({ progresses: processedProgresses });
    }
    catch (error) {
        console.error('获取阅读进度列表错误:', error);
        res.status(500).json({ error: '获取失败' });
    }
});
// 保存阅读设置
router.post('/settings', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const settings = req.body;
        // 检查是否已有设置
        const existing = db_1.db
            .prepare('SELECT id FROM reading_settings WHERE user_id = ?')
            .get(userId);
        if (existing) {
            // 更新设置
            db_1.db.prepare(`
        UPDATE reading_settings 
        SET settings = ?, updated_at = ?
        WHERE user_id = ?
      `).run(JSON.stringify(settings), userId);
        }
        else {
            // 创建新设置
            const settingsId = (0, uuid_1.v4)();
            db_1.db.prepare(`
        INSERT INTO reading_settings (id, user_id, settings)
        VALUES (?, ?, ?)
      `).run(settingsId, userId, JSON.stringify(settings));
        }
        res.json({ message: '设置已保存' });
    }
    catch (error) {
        console.error('保存阅读设置错误:', error);
        res.status(500).json({ error: '保存失败' });
    }
});
// 获取阅读设置
router.get('/settings', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const result = db_1.db
            .prepare('SELECT settings FROM reading_settings WHERE user_id = ?')
            .get(userId);
        if (!result || !result.settings) {
            // 返回默认设置
            return res.json({
                settings: {
                    fontSize: 18,
                    fontFamily: 'default',
                    lineHeight: 1.8,
                    theme: 'light',
                    brightness: 100,
                    margin: 20,
                    pageTurnMode: 'horizontal',
                    clickToTurn: true,
                    keyboardShortcuts: {
                        prev: 'ArrowLeft',
                        next: 'ArrowRight',
                    },
                },
            });
        }
        res.json({ settings: JSON.parse(result.settings) });
    }
    catch (error) {
        console.error('获取阅读设置错误:', error);
        res.status(500).json({ error: '获取失败' });
    }
});
// 获取阅读器偏好设置
router.get('/preferences', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { bookId, fileType } = req.query;
        let query = 'SELECT * FROM reader_preferences WHERE user_id = ?';
        const params = [userId];
        if (bookId) {
            // 先查找书籍特定设置，如果没有则查找全局设置
            const bookPref = db_1.db
                .prepare('SELECT * FROM reader_preferences WHERE user_id = ? AND book_id = ? AND file_type = ?')
                .get(userId, bookId, fileType || 'epub');
            if (bookPref) {
                return res.json({
                    preference: {
                        fileType: bookPref.file_type,
                        readerType: bookPref.reader_type,
                        settings: bookPref.settings ? JSON.parse(bookPref.settings) : null,
                    },
                });
            }
        }
        if (fileType) {
            query += ' AND file_type = ? AND book_id IS NULL';
            params.push(fileType);
        }
        else {
            query += ' AND book_id IS NULL';
        }
        const preferences = db_1.db.prepare(query).all(...params);
        const result = {};
        preferences.forEach((pref) => {
            result[pref.file_type] = {
                readerType: pref.reader_type,
                settings: pref.settings ? JSON.parse(pref.settings) : null,
            };
        });
        // 如果没有设置，返回默认值
        if (Object.keys(result).length === 0) {
            result.epub = { readerType: 'epubjs', settings: null };
            result.pdf = { readerType: 'pdfjs', settings: null };
            result.txt = { readerType: 'native', settings: null };
        }
        else {
            // 如果部分设置了，为未设置的返回默认值
            if (!result.epub) {
                result.epub = { readerType: 'epubjs', settings: null };
            }
            if (!result.pdf) {
                result.pdf = { readerType: 'pdfjs', settings: null };
            }
            if (!result.txt) {
                result.txt = { readerType: 'native', settings: null };
            }
        }
        res.json({ preferences: result });
    }
    catch (error) {
        console.error('获取阅读器偏好失败:', error);
        res.status(500).json({ error: '获取失败' });
    }
});
// 保存阅读器偏好设置
router.post('/preferences', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { bookId, fileType, readerType, settings } = req.body;
        if (!fileType || !readerType) {
            return res.status(400).json({ error: '请提供文件类型和阅读器类型' });
        }
        // 检查是否已有设置
        const existing = db_1.db
            .prepare('SELECT id FROM reader_preferences WHERE user_id = ? AND book_id IS ? AND file_type = ?')
            .get(userId, bookId || null, fileType);
        if (existing) {
            // 更新设置
            db_1.db.prepare(`
        UPDATE reader_preferences 
        SET reader_type = ?, settings = ?, updated_at = ?
        WHERE id = ?
      `).run(readerType, settings ? JSON.stringify(settings) : null, getCurrentUTCTime(), existing.id);
        }
        else {
            // 创建新设置
            const prefId = (0, uuid_1.v4)();
            db_1.db.prepare(`
        INSERT INTO reader_preferences (id, user_id, book_id, file_type, reader_type, settings)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(prefId, userId, bookId || null, fileType, readerType, settings ? JSON.stringify(settings) : null);
        }
        res.json({ message: '阅读器偏好已保存' });
    }
    catch (error) {
        console.error('保存阅读器偏好失败:', error);
        res.status(500).json({ error: '保存失败' });
    }
});
// 删除阅读器偏好设置（恢复默认值）
router.delete('/preferences', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { bookId, fileType } = req.query;
        if (!fileType) {
            return res.status(400).json({ error: '请提供文件类型' });
        }
        // 删除全局设置（bookId为null）或特定书籍的设置
        const result = db_1.db
            .prepare('DELETE FROM reader_preferences WHERE user_id = ? AND book_id IS ? AND file_type = ?')
            .run(userId, bookId || null, fileType);
        if (result.changes > 0) {
            res.json({ message: '阅读器偏好已删除，将使用默认值' });
        }
        else {
            res.json({ message: '未找到相关设置' });
        }
    }
    catch (error) {
        console.error('删除阅读器偏好失败:', error);
        res.status(500).json({ error: '删除失败' });
    }
});
// 获取阅读历史列表
router.get('/history', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { limit = 50 } = req.query;
        const history = db_1.db
            .prepare(`
        SELECT 
          h.id as history_id,
          h.last_read_at,
          h.total_reading_time,
          h.total_progress,
          h.read_count,
          b.id,
          b.title,
          b.author,
          b.cover_url,
          b.file_type
        FROM reading_history h
        JOIN books b ON h.book_id = b.id
        WHERE h.user_id = ? AND b.parent_book_id IS NULL
        ORDER BY h.last_read_at DESC
        LIMIT ?
      `)
            .all(userId, Number(limit));
        res.json({ history });
    }
    catch (error) {
        console.error('获取阅读历史错误:', error);
        res.status(500).json({ error: '获取失败' });
    }
});
// 获取单本书的详细阅读历史（包括所有会话）
router.get('/history/:bookId', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { bookId } = req.params;
        // 获取主记录
        const history = db_1.db
            .prepare(`
        SELECT 
          h.id as history_id,
          h.last_read_at,
          h.total_reading_time,
          h.total_progress,
          h.read_count,
          b.id,
          b.title,
          b.author,
          b.cover_url,
          b.file_type
        FROM reading_history h
        JOIN books b ON h.book_id = b.id
        WHERE h.user_id = ? AND h.book_id = ?
      `)
            .get(userId, bookId);
        if (!history) {
            return res.json({ history: null, sessions: [] });
        }
        // 获取所有阅读会话
        const sessions = db_1.db
            .prepare(`
        SELECT 
          id,
          start_time,
          end_time,
          duration,
          progress_before,
          progress_after
        FROM reading_sessions
        WHERE history_id = ?
        ORDER BY start_time DESC
      `)
            .all(history.history_id);
        res.json({ history, sessions });
    }
    catch (error) {
        console.error('获取详细阅读历史错误:', error);
        res.status(500).json({ error: '获取失败' });
    }
});
// 删除阅读历史
router.delete('/history/:bookId', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { bookId } = req.params;
        // 检查记录是否存在且属于当前用户
        const history = db_1.db
            .prepare('SELECT id FROM reading_history WHERE user_id = ? AND book_id = ?')
            .get(userId, bookId);
        if (!history) {
            return res.status(404).json({ error: '阅读历史不存在' });
        }
        // 删除记录（级联删除会同时删除所有会话）
        db_1.db.prepare('DELETE FROM reading_history WHERE id = ?').run(history.id);
        res.json({ message: '阅读历史已删除' });
    }
    catch (error) {
        console.error('删除阅读历史错误:', error);
        res.status(500).json({ error: '删除失败' });
    }
});
// 获取用户阅读统计
router.get('/history/stats/summary', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        // 总阅读书籍数
        const totalBooks = db_1.db
            .prepare('SELECT COUNT(*) as count FROM reading_history WHERE user_id = ?')
            .get(userId);
        // 本月阅读时长（秒）
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const monthReadingTime = db_1.db
            .prepare(`
        SELECT COALESCE(SUM(duration), 0) as total
        FROM reading_sessions
        WHERE user_id = ? AND start_time >= ?
      `)
            .get(userId, monthStart);
        // 年度阅读时长（秒）
        const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();
        const yearReadingTime = db_1.db
            .prepare(`
        SELECT COALESCE(SUM(duration), 0) as total
        FROM reading_sessions
        WHERE user_id = ? AND start_time >= ?
      `)
            .get(userId, yearStart);
        res.json({
            totalBooks: totalBooks?.count || 0,
            monthReadingTime: monthReadingTime?.total || 0,
            yearReadingTime: yearReadingTime?.total || 0,
        });
    }
    catch (error) {
        console.error('获取阅读统计错误:', error);
        res.status(500).json({ error: '获取失败' });
    }
});
// 创建阅读会话（由前端在开始阅读时调用）
router.post('/history/session', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { bookId, startTime } = req.body;
        if (!bookId) {
            return res.status(400).json({ error: '请提供书籍ID' });
        }
        // 获取当前进度（先获取，用于创建/更新历史记录）
        // 优先使用 reading_progress 表中的 progress 值
        const progress = db_1.db
            .prepare('SELECT progress FROM reading_progress WHERE user_id = ? AND book_id = ?')
            .get(userId, bookId);
        let currentProgress = progress?.progress || 0;
        // 如果 progress 为 0，尝试从 reading_history 表获取最新的 total_progress
        if (currentProgress === 0) {
            const history = db_1.db
                .prepare('SELECT total_progress FROM reading_history WHERE user_id = ? AND book_id = ?')
                .get(userId, bookId);
            if (history && history.total_progress > 0) {
                currentProgress = history.total_progress;
                console.log('📖 创建会话：使用历史记录中的进度值', currentProgress);
            }
        }
        // 获取或创建历史记录
        let history = db_1.db
            .prepare('SELECT id, last_read_at FROM reading_history WHERE user_id = ? AND book_id = ?')
            .get(userId, bookId);
        if (!history) {
            const historyId = (0, uuid_1.v4)();
            db_1.db.prepare(`
        INSERT INTO reading_history (id, user_id, book_id, last_read_at, total_progress, read_count)
        VALUES (?, ?, ?, ?, ?, 0)
      `).run(historyId, userId, bookId, getCurrentUTCTime(), currentProgress);
            history = { id: historyId, last_read_at: null };
        }
        else {
            // 更新进度（确保使用最新的进度值）
            db_1.db.prepare(`
        UPDATE reading_history
        SET total_progress = ?,
            updated_at = ?
        WHERE id = ?
      `).run(currentProgress, getCurrentUTCTime(), history.id);
        }
        // 检查是否有1小时内的活跃会话（视为同次阅读）
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const existingActiveSession = db_1.db
            .prepare(`
        SELECT id FROM reading_sessions 
        WHERE history_id = ? AND end_time IS NULL AND start_time > ?
        ORDER BY start_time DESC LIMIT 1
      `)
            .get(history.id, oneHourAgo);
        let sessionId;
        if (existingActiveSession) {
            // 使用现有会话（同次阅读）
            sessionId = existingActiveSession.id;
            console.log('📖 使用现有会话（1小时内）:', sessionId);
        }
        else {
            // 创建新会话
            sessionId = (0, uuid_1.v4)();
            db_1.db.prepare(`
        INSERT INTO reading_sessions (
          id, history_id, user_id, book_id, start_time, progress_before
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(sessionId, history.id, userId, bookId, startTime || getCurrentUTCTime(), currentProgress);
            console.log('📖 创建新阅读会话:', sessionId);
        }
        res.json({ sessionId });
    }
    catch (error) {
        console.error('创建阅读会话错误:', error);
        res.status(500).json({ error: '创建失败' });
    }
});
// 结束阅读会话（由前端在结束阅读时调用）
router.put('/history/session/:sessionId', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { sessionId } = req.params;
        const { endTime, progressAfter } = req.body;
        console.log('📖 收到结束会话请求:', { sessionId, userId, endTime, progressAfter });
        // 获取会话信息
        const session = db_1.db
            .prepare('SELECT * FROM reading_sessions WHERE id = ? AND user_id = ?')
            .get(sessionId, userId);
        if (!session) {
            return res.status(404).json({ error: '会话不存在' });
        }
        if (!session.history_id) {
            console.error('会话缺少 history_id:', sessionId, session);
            return res.status(500).json({ error: '会话数据不完整' });
        }
        if (!session.book_id) {
            console.error('会话缺少 book_id:', sessionId, session);
            return res.status(500).json({ error: '会话数据不完整：缺少book_id' });
        }
        const end = endTime || getCurrentUTCTime();
        const start = new Date(session.start_time);
        const endDate = new Date(end);
        if (isNaN(start.getTime()) || isNaN(endDate.getTime())) {
            console.error('无效的时间格式:', { start_time: session.start_time, endTime });
            return res.status(400).json({ error: '无效的时间格式' });
        }
        let duration = Math.floor((endDate.getTime() - start.getTime()) / 1000); // 秒
        if (duration < 0) {
            console.warn('计算出的时长为负数，使用0:', { duration, start_time: session.start_time, endTime });
            duration = 0;
        }
        // 获取最新的进度值（如果 progressAfter 未提供，从 reading_progress 表获取）
        let finalProgressAfter = progressAfter;
        if (finalProgressAfter === undefined || finalProgressAfter === null) {
            try {
                const currentProgress = db_1.db
                    .prepare('SELECT progress FROM reading_progress WHERE user_id = ? AND book_id = ?')
                    .get(userId, session.book_id);
                finalProgressAfter = currentProgress?.progress || session.progress_before || 0;
                // 如果 reading_progress 中的 progress 也是 0，尝试从 reading_history 获取
                if (finalProgressAfter === 0) {
                    const history = db_1.db
                        .prepare('SELECT total_progress FROM reading_history WHERE user_id = ? AND book_id = ?')
                        .get(userId, session.book_id);
                    if (history && history.total_progress > 0) {
                        finalProgressAfter = history.total_progress;
                    }
                }
            }
            catch (err) {
                console.error('获取进度值失败:', err);
                finalProgressAfter = session.progress_before || 0;
            }
        }
        // 确保 finalProgressAfter 是有效数字
        if (typeof finalProgressAfter !== 'number' || isNaN(finalProgressAfter)) {
            console.warn('无效的 progressAfter，使用0:', finalProgressAfter);
            finalProgressAfter = 0;
        }
        // 更新会话
        try {
            const updateSessionResult = db_1.db.prepare(`
        UPDATE reading_sessions
        SET end_time = ?,
            duration = ?,
            progress_after = ?
        WHERE id = ?
      `).run(end, duration, finalProgressAfter, sessionId);
            if (updateSessionResult.changes === 0) {
                console.error('更新会话失败，会话可能已被删除:', sessionId);
                return res.status(404).json({ error: '会话不存在或已被删除' });
            }
        }
        catch (err) {
            console.error('更新会话时发生错误:', err);
            throw err;
        }
        console.log('📖 结束阅读会话:', {
            sessionId,
            progress_before: session.progress_before,
            progress_after: finalProgressAfter,
            duration,
        });
        // 更新历史记录
        // ⚠️ 重要：总时长 = 所有已结束会话的 duration 之和
        // 获取会话的最终 duration（可能已经在翻页时更新过）
        const finalSession = db_1.db
            .prepare('SELECT duration FROM reading_sessions WHERE id = ?')
            .get(sessionId);
        let finalDuration = (finalSession?.duration !== null && finalSession?.duration !== undefined)
            ? finalSession.duration
            : (duration !== null && duration !== undefined ? duration : 0);
        // 确保 finalDuration 是有效数字
        if (typeof finalDuration !== 'number' || isNaN(finalDuration) || finalDuration < 0) {
            console.warn('无效的 finalDuration，使用0:', finalDuration);
            finalDuration = 0;
        }
        // 重新计算总时长 = 所有已结束会话的 duration 之和（确保准确性）
        // 注意：排除当前会话，避免重复计算
        let previousTotal = 0;
        try {
            const allSessionsTotal = db_1.db
                .prepare(`
          SELECT COALESCE(SUM(duration), 0) as total
          FROM reading_sessions
          WHERE history_id = ? AND end_time IS NOT NULL AND id != ?
        `)
                .get(session.history_id, sessionId);
            previousTotal = (allSessionsTotal?.total !== null && allSessionsTotal?.total !== undefined)
                ? Number(allSessionsTotal.total)
                : 0;
            // 确保 previousTotal 是有效数字
            if (isNaN(previousTotal) || previousTotal < 0) {
                console.warn('无效的 previousTotal，使用0:', previousTotal);
                previousTotal = 0;
            }
        }
        catch (err) {
            console.error('查询总时长失败:', err);
            previousTotal = 0;
        }
        const newTotalReadingTime = Math.floor(previousTotal + finalDuration);
        // 更新总时长（使用重新计算的值，确保准确性）
        // 确保 newTotalReadingTime 是有效数字
        if (typeof newTotalReadingTime !== 'number' || isNaN(newTotalReadingTime) || newTotalReadingTime < 0) {
            console.error('无效的 newTotalReadingTime:', newTotalReadingTime);
            throw new Error(`无效的总时长值: ${newTotalReadingTime}`);
        }
        let updateResult;
        try {
            updateResult = db_1.db.prepare(`
        UPDATE reading_history
        SET total_reading_time = ?,
            read_count = read_count + 1,
            updated_at = ?
        WHERE id = ?
      `).run(newTotalReadingTime, getCurrentUTCTime(), session.history_id);
            if (updateResult.changes === 0) {
                console.error('更新历史记录失败，未找到对应的历史记录:', session.history_id);
                throw new Error(`历史记录不存在: ${session.history_id}`);
            }
        }
        catch (err) {
            console.error('更新历史记录时发生错误:', err);
            console.error('更新参数:', {
                newTotalReadingTime,
                historyId: session.history_id,
                typeOfNewTotal: typeof newTotalReadingTime,
            });
            throw err;
        }
        console.log('📖 结束会话并更新总时长:', {
            sessionId,
            finalDuration,
            previousTotal: previousTotal,
            newTotal: newTotalReadingTime,
            historyId: session.history_id,
        });
        res.json({ message: '会话已更新' });
    }
    catch (error) {
        console.error('结束阅读会话错误:', error);
        console.error('错误详情:', {
            message: error?.message,
            stack: error?.stack,
            sessionId: req.params.sessionId,
            userId: req.userId,
        });
        res.status(500).json({ error: '更新失败', details: error?.message });
    }
});
exports.default = router;
//# sourceMappingURL=reading.js.map
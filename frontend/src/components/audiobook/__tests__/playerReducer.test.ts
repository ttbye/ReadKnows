/**
 * @file playerReducer.test.ts
 * @description playerReducer 单元测试
 */

import { describe, it, expect } from 'vitest';
import { playerReducer, createInitialState, playerActions } from '../playerReducer';
import { PlayerAction } from '../types';

describe('playerReducer', () => {
  it('应该创建正确的初始状态', () => {
    const state = createInitialState('file1', false);
    
    expect(state.currentFileId).toBe('file1');
    expect(state.isPlaying).toBe(false);
    expect(state.currentTime).toBe(0);
    expect(state.duration).toBe(0);
    expect(state.volume).toBe(1);
    expect(state.isMuted).toBe(false);
    expect(state.playbackRate).toBe(1);
    expect(state.isLoading).toBe(false);
  });

  it('应该处理 SET_PLAYING action', () => {
    const initialState = createInitialState('file1', false);
    const action = playerActions.setPlaying(true);
    
    const newState = playerReducer(initialState, action);
    
    expect(newState.isPlaying).toBe(true);
  });

  it('应该处理 SET_PAUSED action', () => {
    const initialState = createInitialState('file1', false);
    initialState.isPlaying = true;
    
    const action = playerActions.setPaused();
    const newState = playerReducer(initialState, action);
    
    expect(newState.isPlaying).toBe(false);
  });

  it('应该处理 SET_CURRENT_TIME action', () => {
    const initialState = createInitialState('file1', false);
    const action = playerActions.setCurrentTime(30);
    
    const newState = playerReducer(initialState, action);
    
    expect(newState.currentTime).toBe(30);
  });

  it('应该处理 SET_DURATION action', () => {
    const initialState = createInitialState('file1', false);
    const action = playerActions.setDuration(100);
    
    const newState = playerReducer(initialState, action);
    
    expect(newState.duration).toBe(100);
  });

  it('应该处理 SET_VOLUME action', () => {
    const initialState = createInitialState('file1', false);
    const action = playerActions.setVolume(0.5);
    
    const newState = playerReducer(initialState, action);
    
    expect(newState.volume).toBe(0.5);
  });

  it('应该处理 SET_MUTED action', () => {
    const initialState = createInitialState('file1', false);
    const action = playerActions.setMuted(true);
    
    const newState = playerReducer(initialState, action);
    
    expect(newState.isMuted).toBe(true);
  });

  it('应该处理 SET_PLAYBACK_RATE action', () => {
    const initialState = createInitialState('file1', false);
    const action = playerActions.setPlaybackRate(1.5);
    
    const newState = playerReducer(initialState, action);
    
    expect(newState.playbackRate).toBe(1.5);
  });

  it('应该处理 SET_CURRENT_FILE_ID action', () => {
    const initialState = createInitialState('file1', false);
    const action = playerActions.setCurrentFileId('file2');
    
    const newState = playerReducer(initialState, action);
    
    expect(newState.currentFileId).toBe('file2');
  });

  it('应该处理 RESET action', () => {
    const initialState = createInitialState('file1', false);
    initialState.isPlaying = true;
    initialState.currentTime = 50;
    initialState.volume = 0.5;
    
    const action = playerActions.reset();
    const newState = playerReducer(initialState, action);
    
    expect(newState.isPlaying).toBe(false);
    expect(newState.currentTime).toBe(0);
    expect(newState.volume).toBe(1);
  });
});

const state = {
  module: null,
  sessionSize: 20,
  sessionBase: [],
  retryQueue: [],
  currentQuestion: null,
  answered: false,
  score: 0,
  wrongCount: 0,
  baseResults: [],
  retryResults: [],
  shownBaseCount: 0
};

const KIDS_APP_PROGRESS_KEY = 'kids-app-study-progress-v1';
const KIDS_APP_APP_ID = 'praeposition';

function shuffleArray(arr){
  const a = [...arr];
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getParam(name){
  return new URLSearchParams(window.location.search).get(name);
}

async function fetchJSON(path){
  const res = await fetch(path);
  if(!res.ok) throw new Error(`HTTP ${res.status}: ${path}`);
  return res.json();
}

async function initHome(){
  const grid = document.getElementById('moduleGrid');
  try{
    const modules = await fetchJSON('data/modules.json');
    grid.innerHTML = '';

    modules.forEach(mod => {
      const a = document.createElement('a');
      a.className = `moduleCard${mod.enabled ? '' : ' disabled'}`;
      a.href = mod.enabled ? `quiz.html?module=${encodeURIComponent(mod.id)}` : '#';

      a.innerHTML = `
        <h3>${mod.title}</h3>
        <p>${mod.description}</p>
        <span class="badge">${mod.enabled ? 'Start' : 'Geplant'}</span>
      `;

      grid.appendChild(a);
    });
  } catch(err){
    grid.innerHTML = `<div class="errorBox">Fehler beim Laden der Module.</div>`;
    console.error(err);
  }
}

function resetSession(questionSet){
  state.sessionSize = questionSet.sessionSize || 20;
  state.sessionBase = shuffleArray(questionSet.questions).slice(0, state.sessionSize).map(q => ({
    ...q,
    repeatLevel: 0,
    isRetry: false
  }));
  state.retryQueue = [];
  state.currentQuestion = null;
  state.answered = false;
  state.score = 0;
  state.wrongCount = 0;
  state.baseResults = [];
  state.retryResults = [];
  state.shownBaseCount = 0;
  reportKidsAppProgress(state.score);
}

function getNextQuestion(){
  if(state.sessionBase.length > 0){
    state.shownBaseCount += 1;
    return state.sessionBase.shift();
  }

  if(state.retryQueue.length > 0){
    return state.retryQueue.shift();
  }

  return null;
}

function queueRetry(question){
  const nextLevel = (question.repeatLevel || 0) + 1;
  if(nextLevel > 2) return;

  state.retryQueue.push({ ...question, isRetry: true, repeatLevel: nextLevel });

  if(nextLevel === 1){
    state.retryQueue.push({ ...question, isRetry: true, repeatLevel: nextLevel });
  }
}

function showScreen(name){
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(`screen-${name}`);
  if(target) target.classList.add('active');
}

function renderQuestion(){
  const q = state.currentQuestion;
  if(!q) return;

  state.answered = false;

  document.getElementById('themeLabel').textContent = state.module.title;
  document.getElementById('questionTitle').textContent = q.isRetry ? 'Wiederholung' : `Aufgabe ${state.shownBaseCount}`;
  document.getElementById('correctStat').textContent = `○ ${state.score}`;
  document.getElementById('wrongStat').textContent = `× ${state.wrongCount}`;
  document.getElementById('progress').textContent = `${Math.min(state.shownBaseCount, state.sessionSize)} / ${state.sessionSize}`;
  document.getElementById('prompt').textContent = q.sentence;
  reportKidsAppProgress(state.score);

  const feedback = document.getElementById('feedback');
  feedback.textContent = '';
  feedback.className = 'feedback';

  document.getElementById('btnNext').disabled = true;
  renderChoices(q);
}

function renderChoices(question){
  const wrap = document.getElementById('choices');
  wrap.innerHTML = '';

  const shuffled = shuffleArray(question.choices);
  shuffled.forEach(choice => {
    const btn = document.createElement('button');
    btn.className = 'choiceBtn';
    btn.textContent = choice;
    btn.addEventListener('click', () => checkAnswer(choice, question, btn));
    wrap.appendChild(btn);
  });
}

function checkAnswer(choice, question, clickedBtn){
  if(state.answered) return;
  state.answered = true;

  const buttons = [...document.querySelectorAll('.choiceBtn')];
  buttons.forEach(btn => {
    btn.disabled = true;
    if(btn.textContent === question.answer) btn.classList.add('correct');
  });

  const feedback = document.getElementById('feedback');
  const isCorrect = choice === question.answer;

  if(isCorrect){
    feedback.textContent = `✓ Richtig: ${question.answer}`;
    feedback.classList.add('ok');
  } else {
    clickedBtn.classList.add('wrong');
    feedback.textContent = `✗ Richtig ist: ${question.answer}`;
    feedback.classList.add('ng');
  }

  if(question.isRetry){
    state.retryResults.push({
      id: question.id,
      sentence: question.sentence,
      user: choice,
      correct: question.answer,
      ok: isCorrect
    });
  } else {
    state.baseResults.push({
      id: question.id,
      sentence: question.sentence,
      user: choice,
      correct: question.answer,
      ok: isCorrect
    });

    if(isCorrect){
      state.score += 1;
    } else {
      state.wrongCount += 1;
    }
  }

  if(!isCorrect) queueRetry(question);
  reportKidsAppProgress(state.score);
  document.getElementById('btnNext').disabled = false;
}

function nextQuestion(){
  if(!state.answered) return;

  const next = getNextQuestion();
  if(!next){
    renderResult();
    showScreen('result');
    return;
  }

  state.currentQuestion = next;
  renderQuestion();
}

function renderResult(){
  const total = state.sessionSize;
  const retryCount = state.retryResults.length;
  const retryCorrect = state.retryResults.filter(item => item.ok).length;

  document.getElementById('resultScore').textContent = `${state.score} / ${total}`;
  reportKidsAppProgress(state.score);

  const wrongItems = state.baseResults.filter(item => !item.ok);

  if(wrongItems.length === 0){
    document.getElementById('resultDetail').innerHTML =
      `Alles richtig!<br>Wiederholungen: ${retryCount}<br>Richtig in Wiederholungen: ${retryCorrect}`;
    return;
  }

  const lines = wrongItems
    .map((item, idx) => `${idx + 1}. ${item.sentence} → ${item.correct}`)
    .join('<br>');

  document.getElementById('resultDetail').innerHTML =
    `Fehler im Grundset:<br>${lines}<br><br>Wiederholungen: ${retryCount}<br>Richtig in Wiederholungen: ${retryCorrect}`;
}

function getKidsAppTodayKey(){
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function reportKidsAppProgress(correctCount){
  try{
    const today = getKidsAppTodayKey();
    const raw = JSON.parse(localStorage.getItem(KIDS_APP_PROGRESS_KEY) || '{}');
    raw[today] ??= {};

    const prev = Number(raw[today][KIDS_APP_APP_ID]?.correct) || 0;
    raw[today][KIDS_APP_APP_ID] = {
      correct: Math.max(prev, Math.max(0, Math.floor(Number(correctCount) || 0))),
      updatedAt: new Date().toISOString()
    };

    localStorage.setItem(KIDS_APP_PROGRESS_KEY, JSON.stringify(raw));
  } catch {}
}

async function initQuiz(){
  const moduleId = getParam('module');
  if(!moduleId){
    window.location.href = 'index.html';
    return;
  }

  try{
    const modules = await fetchJSON('data/modules.json');
    const mod = modules.find(m => m.id === moduleId);
    if(!mod) throw new Error('Module not found');

    state.module = mod;
    document.getElementById('quizTitle').textContent = mod.title;
    document.getElementById('quizSubtitle').textContent = mod.description;

    const questionSet = await fetchJSON(mod.file);
    resetSession(questionSet);
    state.currentQuestion = getNextQuestion();

    if(!state.currentQuestion){
      throw new Error('No questions available');
    }

    document.getElementById('btnNext').addEventListener('click', nextQuestion);
    document.getElementById('btnBackMenu').addEventListener('click', () => {
      window.location.href = 'index.html';
    });
    document.getElementById('btnResultMenu').addEventListener('click', () => {
      window.location.href = 'index.html';
    });
    document.getElementById('btnRetry').addEventListener('click', () => {
      resetSession(questionSet);
      state.currentQuestion = getNextQuestion();
      showScreen('quiz');
      renderQuestion();
    });

    showScreen('quiz');
    renderQuestion();
  } catch(err){
    const quiz = document.getElementById('screen-quiz');
    if(quiz){
      quiz.innerHTML = `<div class="errorBox">Fehler beim Laden des Moduls.</div>`;
    }
    console.error(err);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if(page === 'home') initHome();
  if(page === 'quiz') initQuiz();
});

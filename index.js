"use strict";
const { html, render, useState, useReducer, useEffect } = window.htmPreact;

function getData(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch (e) {
    return null;
  }
}

function usePersistentReducer(reducer, key, fallback) {
  const [data, dispatch] = useReducer(reducer, getData(key) || fallback);

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(data));
  }, [data]);

  return [data, dispatch];
}

function appReducer({ questions, maxKey = 0 }, action) {
  switch (action.type) {
    case "ADD": {
      return {
        questions: [...questions, { ...action.payload, key: maxKey }],
        maxKey: maxKey + 1,
      };
    }
    case "REMOVE": {
      return {
        questions: questions.filter(e => e.key != action.payload),
        maxKey,
      };
    }
    case "IMPORT": {
      return {
        questions: action.payload.map((e, i) => ({ ...e, key: i })),
        maxKey: action.payload.length,
      };
    }
    default: {
      return { questions, maxKey };
    }
  }
}

function exportData(questions) {
  const a = document.createElement("a");
  a.setAttribute("download", "flashcards-data.json");
  const strData = JSON.stringify({
    questions: questions.map(({ q, a, tags }) => ({ q, a, tags })),
  });
  a.href = `data:text/plain;charset=utf-8,${strData}`;
  a.click();
}

function getFileText(file) {
  // Ponyfill of file.text() for Safari
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result);
    };

    reader.onerror = () => {
      reader.abort();
      reject();
    };

    reader.readAsText(file, "utf-8");
  });
}

async function importData(event, dispatch) {
  const input = event.target;
  const { files, form } = input;
  if (!files.length) {
    return;
  }

  try {
    const textData = await getFileText(files[0]);
    const data = JSON.parse(textData);
    const payload = data.questions.map(({ q, a, tags }) => ({ q, a, tags }));

    dispatch({ type: "IMPORT", payload });
  } catch (e) {
    console.groupCollapsed("Error while importing file");
    console.error(e);
    console.groupEnd();
  } finally {
    form.reset();
  }
}

function App() {
  const [{ questions }, dispatch] = usePersistentReducer(
    appReducer,
    "appState",
    { questions: [] },
  );
  return html`
    <div>
      <${ManageQuestions}
        add=${q => dispatch({ type: "ADD", payload: q })}
        remove=${key => dispatch({ type: "REMOVE", payload: key })}
        dispatch=${dispatch}
        questions=${questions}
      />
      <${Series} questions=${questions} />
    </div>
  `;
}

function seriesReducer({ questions, started }, action) {
  switch (action.type) {
    case "START": {
      return {
        questions: shuffle(action.payload),
        started: true,
      };
    }
    case "NEXT": {
      const [, ...rest] = questions;
      return {
        questions: rest,
        started,
      };
    }
  }
}

function Series({ questions: storedQ }) {
  const [{ questions }, dispatch] = useReducer(seriesReducer, {
    questions: [],
    started: false,
  });

  const start = () => {
    const selectedTag = document.querySelector('[name="theme"]').value;
    let questions = storedQ.slice();
    if (selectedTag) {
      questions = questions.filter(q => {
        return q.tags && q.tags.includes(selectedTag);
      });
    }

    dispatch({ type: "START", payload: questions });
  };

  const tags = storedQ.reduce((acc, q) => {
    if (q.tags && q.tags.length) {
      for (const tag of q.tags) {
        acc.add(tag);
      }
    }
    return acc;
  }, new Set());

  const sortedTags = Array.from(tags).sort();

  return html`
    <form>
      <label>
        <select name="theme">
          <option>No theme</option>
          ${sortedTags.map(
            tag =>
              html`
                <option value=${tag} key=${tag}>${tag}</option>
              `,
          )}
        </select>
      </label>
      <button type="button" onClick=${start}>
        Start series
      </button>
    </form>
    ${questions.length
      ? html`
          <${FlashCard}
            question=${questions[0].q}
            answer=${questions[0].a}
            key=${questions[0].q}
            onClick=${() => dispatch({ type: "NEXT" })}
          />
          <button type="button" onClick=${() => dispatch({ type: "NEXT" })}>
            Next
          </button>
        `
      : "💯"}
  `;
}

function shuffle(array) {
  // Shuffle using Fisher Yates algorithm
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function Question({ question, remove }) {
  return html`
    <li>
      <ul class="pre-wrap">
        <li>
          Question:
          <div>${question.q}</div>
        </li>
        <li>
          Answer:
          <div>${question.a}</div>
        </li>
        <li>
          Tags:
          <ul>
            ${question.tags &&
              question.tags.map(
                tag =>
                  html`
                    <li>${tag}</li>
                  `,
              )}
          </ul>
        </li>
      </ul>
      <button onclick=${() => remove(question.key)}>Delete</button>
    </li>
  `;
}

function ManageQuestions({ add, remove, questions, dispatch }) {
  return html`
    <details>
      <summary>Manage questions</summary>
      <button type="button" onclick=${() => exportData(questions)}>
        Export
      </button>
      <form>
        <input type="file" onChange=${event => importData(event, dispatch)} />
      </form>
      <${AddQuestion} add=${add} />
      <ul>
        ${questions.map(
          question =>
            html`
              <${Question}
                question=${question}
                key=${question.key}
                remove=${remove}
              />
            `,
        )}
      </ul>
    </details>
  `;
}

function AddQuestion({ add }) {
  const [tags, setTags] = useState([]);

  function onSumbit(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const q = formData.get("q");
    const a = formData.get("a");
    if (!a || !q) {
      return;
    }
    add({ q, a, tags });
    form.reset();
    setTags([]);
  }

  function addTag(event) {
    const { form } = event.target;
    const formData = new FormData(form);
    const tag = formData.get("tag");
    if (tag && !tags.includes(tag)) {
      setTags(tags => [...tags, tag]);
      window.addTagForm = form;
      // Clear input
      form.querySelector('[name="tag"]').value = "";
    }
  }

  function onTagKeydown(event) {
    const { form } = event.target;
    if (event.keyCode === 13) {
      event.preventDefault();
      form.querySelector('button[name="addTag"]').click();
    }
  }

  function deleteTag(i) {
    setTags(tags => tags.filter((_, j) => i !== j));
  }

  return html`
    <form onsubmit=${onSumbit} autocomplete="off">
      <div>
        <label>Question: <textarea name="q"/></label>
      </div>
      <div>
        <label>Reponse: <textarea name="a"/></label>
      </div>
      <ul>
        ${tags.map(
          (tag, i) =>
            html`
              <li key=${i}>
                ${tag}
                <button type="button" onclick=${() => deleteTag(i)}>
                  Delete Tag
                </button>
              </li>
            `,
        )}
      </ul>
      <div>
        <label>Add tag: <input name="tag" onkeydown=${onTagKeydown}/></label>
        <button type="button" name="addTag" onclick=${addTag}>Add Tag</button>
      </div>

      <button>Add question</button>
    </form>
  `;
}

function FlashCard({ question, answer, onClick }) {
  const [isToggled, toggle] = useReducer(s => !s, false);

  return html`
    <div
      style=${{
        margin: 20,
        boxShadow: "0 1px 1px rgba(0,0,0,0.25)",
        border: `2px solid ${!isToggled ? "cyan" : "green"}`,
        borderRadius: 3,
        padding: "5px 10px",
        cursor: "pointer",
        textAlign: "center",
      }}
      onClick=${isToggled ? onClick : toggle}
    >
      <h6 style=${{ margin: 0 }}>${!isToggled ? "Question" : "Reponse"}<//>
      <div class="pre-wrap">
        ${!isToggled ? question : answer}
      </div>
    <//>
  `;
}

render(
  html`
    <${App} />
  `,
  document.getElementById("root"),
);

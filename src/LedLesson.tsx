
import { useState } from 'react';
import './LedLesson.css';

function LedLesson() {
  const [isLedOn, setIsLedOn] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [selectedPin, setSelectedPin] = useState(13);
  const [selectedBoardPart, setSelectedBoardPart] = useState('digital');

  const answers = [
    { value: 'light', label: 'It will light up normally.' },
    { value: 'off', label: 'It will usually stay off.' },
    { value: 'explode', label: 'It will immediately burn out.' },
  ];

  const boardParts = [
    {
      id: 'usb',
      number: '1',
      name: 'USB port',
      x: 12,
      y: 64,
      description:
        'The silver connector on the left of the photo. It connects the Arduino to a computer for uploading programs and communication.',
    },
    {
      id: 'digital',
      number: '2',
      name: 'Digital pins (0–13)',
      x: 39,
      y: 26,
      description:
        'The long socket row along the upper-left edge. Digital pins can read HIGH or LOW signals and control outputs. We will use pin 13 for our LED lesson.',
    },
    {
      id: 'power',
      number: '3',
      name: 'Power pins',
      x: 72,
      y: 65,
      description:
        'The socket group marked POWER. It includes connections such as 5V, 3.3V, GND, and other power-related pins.',
    },
    {
      id: 'analog',
      number: '4',
      name: 'Analog inputs (A0–A5)',
      x: 84,
      y: 49,
      description:
        'The socket row marked ANALOG IN on the right-hand side. These inputs can measure varying voltages from compatible sensors.',
    },
    {
      id: 'dc',
      number: '5',
      name: 'DC power jack',
      x: 43,
      y: 86,
      description:
        'The black round connector near the bottom of the photo. It accepts a suitable external DC power supply.',
    },
    {
      id: 'chip',
      number: '6',
      name: 'Main microcontroller',
      x: 66,
      y: 49,
      description:
        'The long black chip near the centre of the board. It executes the uploaded program and controls the Arduino.',
    },
  ];

  const activeBoardPart =
    boardParts.find((part) => part.id === selectedBoardPart) ??
    boardParts[1];

  return (
    <section className="led-lesson">
      <div className="led-lesson-header">
        <span className="lesson-tag">
          LESSON 01 · DIGITAL OUTPUT
        </span>
        <h2>Let's light up an LED</h2>
        <p>
          First, understand the component. Then, learn how to
          control it with code.
        </p>
      </div>

      {/* 01 — Understanding the LED */}
      <div className="concept-card">
        <span className="concept-number">01 · THE CONCEPT</span>
        <h3>Meet the LED</h3>
        <p>
          LED stands for <strong>Light-Emitting Diode</strong>.
          It produces light when electric current flows through
          it in the correct direction.
        </p>

        <div className="led-facts">
          <div className="led-fact">
            <span className="fact-symbol">+</span>
            <div>
              <strong>Anode</strong>
              <p>The positive side. Usually the longer leg.</p>
            </div>
          </div>

          <div className="led-fact">
            <span className="fact-symbol">−</span>
            <div>
              <strong>Cathode</strong>
              <p>The negative side. Usually the shorter leg.</p>
            </div>
          </div>

          <div className="led-fact">
            <span className="fact-symbol">R</span>
            <div>
              <strong>Resistor</strong>
              <p>
                Limits current to help protect the LED from
                excessive current.
              </p>
            </div>
          </div>
        </div>

        <p className="concept-note">
          The leg lengths are useful clues, but they may have
          been trimmed. Check the LED's flat edge or component
          documentation if unsure.
        </p>
      </div>

      {/* Quick knowledge check */}
      <div className="knowledge-check">
        <span className="concept-number">QUICK CHECK</span>
        <h3>Let's test your understanding</h3>
        <p>
          Imagine connecting a normal LED the wrong way around
          in a simple, low-voltage circuit. What will usually
          happen?
        </p>

        <div className="answer-options">
          {answers.map((answer) => (
            <button
              key={answer.value}
              type="button"
              className={`answer-option ${
                selectedAnswer === answer.value
                  ? 'answer-selected'
                  : ''
              }`}
              onClick={() => {
                setSelectedAnswer(answer.value);
                setShowFeedback(false);
              }}
            >
              <span className="answer-radio">
                {selectedAnswer === answer.value ? '●' : '○'}
              </span>
              {answer.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="check-answer-button"
          onClick={() => setShowFeedback(true)}
          disabled={!selectedAnswer}
        >
          Check my answer
        </button>

        {showFeedback && (
          <div
            className={`answer-feedback ${
              selectedAnswer === 'off'
                ? 'feedback-correct'
                : 'feedback-try-again'
            }`}
            role="status"
          >
            {selectedAnswer === 'off' ? (
              <>
                <strong>That's right! 🎉</strong>
                <p>
                  An LED normally blocks current in the reverse
                  direction, so it usually stays off. Excessive
                  reverse voltage can damage it.
                </p>
              </>
            ) : (
              <>
                <strong>Not quite — try again.</strong>
                <p>
                  Think about the direction in which current
                  can flow through an LED. Reversing it doesn't
                  normally make it brighter.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* 02 — Meet the Arduino */}
      <div className="concept-card pin-explorer">
        <span className="concept-number">
          02 · MEET THE ARDUINO
        </span>
        <h3>What is a pin?</h3>

        <p>
          An Arduino is a programmable board that can interact
          with components such as LEDs, buttons, and sensors.
          Select a numbered marker on the photograph to explore
          its main parts.
        </p>

        <div className="arduino-board-guide">
          <div className="arduino-image-stage">
            <img
              src="/images/arduino-uno.jpg"
              alt="Arduino Uno Rev3 board"
              className="arduino-board-image"
            />

            {boardParts.map((part) => (
              <button
                key={part.id}
                type="button"
                className={`board-marker ${
                  selectedBoardPart === part.id
                    ? 'marker-active'
                    : ''
                }`}
                style={{
                  left: `${part.x}%`,
                  top: `${part.y}%`,
                }}
                onClick={() => setSelectedBoardPart(part.id)}
                aria-label={`Explore ${part.name}`}
                aria-pressed={selectedBoardPart === part.id}
                title={part.name}
              >
                {part.number}
              </button>
            ))}
          </div>

          <p className="board-caption">
            Arduino Uno Rev3 · Select a numbered marker
          </p>

          {/* One explanation panel, updated by the selected marker */}
          <div className="board-detail" aria-live="polite">
            <span className="board-detail-number">
              COMPONENT {activeBoardPart.number} OF 6
            </span>
            <h4>{activeBoardPart.name}</h4>
            <p>{activeBoardPart.description}</p>
          </div>
        </div>

        <p>
          A <strong>pin</strong> is a connection point on the
          board. The Arduino can use certain pins to receive
          signals or control connected components.
        </p>

        <div className="pin-types">
          <div>
            <strong>Digital pins</strong>
            <p>
              These can read or produce digital signals, such
              as HIGH and LOW. We'll use one to control our LED.
            </p>
          </div>

          <div>
            <strong>Other connections</strong>
            <p>
              Power, GND, and analog input pins serve different
              purposes. We'll explore them as we need them.
            </p>
          </div>
        </div>

        <h4>Explore the digital pins</h4>
        <p>
          Select a pin below. The code examples will update to
          use the selected pin.
        </p>

        <div className="digital-pin-grid">
          {Array.from({ length: 14 }, (_, pin) => (
            <button
              key={pin}
              type="button"
              className={`digital-pin ${
                selectedPin === pin ? 'pin-selected' : ''
              }`}
              onClick={() => setSelectedPin(pin)}
              aria-pressed={selectedPin === pin}
              aria-label={`Select digital pin ${pin}`}
            >
              <span>D{pin}</span>
              <small>
                {pin === 13 ? 'LED example' : 'Digital pin'}
              </small>
            </button>
          ))}
        </div>

        <div className="selected-pin-info" aria-live="polite">
          <span className="concept-number">
            YOU SELECTED DIGITAL PIN {selectedPin}
          </span>

          {selectedPin === 13 ? (
            <p>
              On a classic Arduino Uno, the built-in LED is
              connected to digital pin 13.
            </p>
          ) : selectedPin === 0 || selectedPin === 1 ? (
            <p>
              Pin {selectedPin} can be used as a digital pin,
              but pins 0 and 1 are also used for serial
              communication on a classic Uno. We'll use pin
              13 for our first experiment.
            </p>
          ) : (
            <p>
              Pin {selectedPin} can generally be configured as
              a digital input or output. We'll use pin 13 for
              our first LED experiment.
            </p>
          )}
        </div>

        <p className="concept-note">
          The numbered markers identify board areas, not every
          individual pin. Board layouts vary across Arduino
          models. The selected pin below is a learning example;
          it does not physically rewire a circuit.
        </p>
      </div>

      {/* 03 — Understanding the code */}
      <div className="concept-card code-intro">
        <span className="concept-number">03 · THE CODE</span>
        <h3>How does an Arduino control an LED?</h3>
        <p>
          The Arduino can set a digital output pin to HIGH or
          LOW. In a suitable circuit, this lets it control
          whether the LED lights up.
        </p>

        <div className="code-explanation">
          <div>
            <code>{`pinMode(${selectedPin}, OUTPUT);`}</code>
            <p>
              Configures the selected pin as an output so the
              Arduino can send a signal through it.
            </p>
          </div>

          <div>
            <code>{`digitalWrite(${selectedPin}, HIGH);`}</code>
            <p>
              Sets the selected pin HIGH. In our example
              circuit, this turns the LED on.
            </p>
          </div>

          <div>
            <code>{`digitalWrite(${selectedPin}, LOW);`}</code>
            <p>
              Sets the selected pin LOW. In our example
              circuit, this turns the LED off.
            </p>
          </div>
        </div>

        <p className="concept-note">
          These examples assume an LED wired from the selected
          pin through a suitable current-limiting resistor to
          GND. Selecting a pin here changes the teaching
          example only; it does not rewire the virtual LED.
        </p>
      </div>

      {/* 04 — Virtual LED experiment */}
      <div className="led-lab">
        <div className="led-display">
          <div
            className={`virtual-led ${isLedOn ? 'led-on' : ''}`}
          >
            <div className="led-bulb" />
            <div className="led-base" />
          </div>

          <p className="led-status">
            LED status: <strong>{isLedOn ? 'ON' : 'OFF'}</strong>
          </p>
        </div>

        <div className="led-controls">
          <span className="concept-number">
            04 · EXPERIMENT
          </span>
          <h3>Your virtual LED</h3>
          <p>
            Try switching the LED on and off. This is a visual
            demonstration of the output state, not a live
            Arduino circuit.
          </p>

          <button
            type="button"
            className="led-toggle-button"
            onClick={() =>
              setIsLedOn((previous) => !previous)
            }
          >
            Turn LED {isLedOn ? 'OFF' : 'ON'}
          </button>

          <div className="observation-question">
            <strong>Think about it</strong>
            <p>
              Which command would you use in your Arduino code
              to switch the LED off: HIGH or LOW?
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default LedLesson;

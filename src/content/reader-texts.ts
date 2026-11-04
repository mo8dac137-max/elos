/**
 * Milestone J1 (Smart Reader): four original A1 reading texts written for
 * this project (not copied from any source, safe to ship). They lean hard
 * on the 48 curriculum words so the state colors are visible immediately,
 * and on the owner's goals: the pharmacy line and the call-centre line.
 *
 * Texts deliberately avoid contractions and possessives, and use the
 * present simple with regular -s/-es endings, which the reader normalizer
 * matches back to the base word units.
 */

export interface ReaderText {
  id: string;
  title: string;
  text: string;
}

export const READER_TEXTS: readonly ReaderText[] = [
  {
    id: 'pharmacy-morning',
    title: 'Morning at the pharmacy',
    text:
      'Sara works in a pharmacy near the hospital. She opens the shop at eight in the morning. ' +
      'People come with a paper from the doctor. Sara reads the paper and gives them their medicine. ' +
      'She says: Take this after food and drink water, not juice. ' +
      'At night she goes home and reads a book.',
  },
  {
    id: 'call-centre-day',
    title: 'A day at the call centre',
    text:
      'Omar has a new job in a call centre. He sits at a small desk with a phone. ' +
      'People call all day with a question or a problem. Omar says: Can I help you? ' +
      'Some people want help with their money. Some people need a doctor for a child. ' +
      'Omar writes every name and number, then he helps them. ' +
      'At the end of the day he is happy with his work.',
  },
  {
    id: 'my-family',
    title: 'My family',
    text:
      'My family is not big: my father, my mother, one brother and one sister. ' +
      'We live in a small house in a quiet city. Every morning we eat breakfast together. ' +
      'My father goes to work by car. My mother is a teacher at the school near our house. ' +
      'After school I read a book or help my mother. ' +
      'At night we eat dinner and talk about our day.',
  },
  {
    id: 'new-phone',
    title: 'A new phone',
    text:
      'Karim wants a new phone. He goes to the shop with his friend. ' +
      'The price of the phone is high, so he asks to see a cheap one. ' +
      'The man in the shop helps him and shows him two phones. ' +
      'Karim pays with the money from his work and buys the phone. ' +
      'At home he calls his family. I have a new phone, he says. Come and see me!',
  },
  {
    id: 'hospital-night',
    title: 'A night at the hospital',
    text:
      'Youssef is a doctor. He works at night in a hospital near the city. ' +
      'Last week a man came with his child at ten in the night. ' +
      'The child ate bad food and drank dirty water, and the man was afraid. ' +
      'The doctor saw the child and asked the man many questions. ' +
      'Then he said: It is not the food. The child needs water and rest, ' +
      'and this medicine after food. The man bought the medicine at the hospital shop. ' +
      'The child drank it and slept. In the morning the child was well again. ' +
      'The man went home happy and said: Thank you, doctor. You help people every night.',
  },
  {
    id: 'help-line',
    title: 'A call to the help line',
    text:
      'Layla answers the phone at a help line in Cairo. ' +
      'People call every day with a question or a problem. ' +
      'Yesterday was a long day. First a man wanted help with his phone. ' +
      'The price of a new phone is high, so Layla helped him fix his old one. ' +
      'Then a woman came with a question about her job. ' +
      'Then a father called: his child needed a doctor, and the hospital was full. ' +
      'Layla wrote the name and the number, and a doctor from the hospital came to the house. ' +
      'In the evening a friend saw Layla at the shop and said: ' +
      'You help people all day. Do you like the work? ' +
      'Layla said: Yes. Every call is a new door, and I know the city now. ' +
      'Come and see us at the help line!',
  },
];

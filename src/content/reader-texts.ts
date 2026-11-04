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
];

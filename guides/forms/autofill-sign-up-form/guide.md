---
name: autofill-sign-up-form
description: Build a sign-up form with correct autocomplete values and autofill support.
web-feature-ids:
  - autocorrect
  - input-email-tel-url
  - inputmode
---

# Build a sign-up form that follows best practice

Use cross-platform browser features to build sign-up forms that are secure, accessible and easy to use.

If users ever need to sign up to your site, then good sign-up form design is critical. This is especially true for people on poor connections, on mobile, in a hurry, or under stress. Poorly designed sign-up forms get high bounce rates. Each bounce could mean a lost customer and a disgruntled user—not just a missed sign-up opportunity.

## How to implement

Outlined below are the most important guidelines for building successful sign-up forms.

### Use meaningful, valid HTML

Make the most of the elements and attributes built for creating forms:

-   `<form>`, `<input>`, `<label>`, and `<button>`
-   `type`, `autocomplete`, and `inputmode`

These enable built-in browser functionality, improve accessibility, and add meaning to markup.

### Use the `<label>` element to label form fields for data entry

To label an `<input>`, `<select>`, or `<textarea>`, use a `<label>`. Associate a label with an input by giving the label's `for` attribute the same value as the input's `id`.

### Make the most of HTML attributes

Make it easy for users to enter data, by using the appropriate `<input>` element `<type>` attribute to provide the right keyboard on mobile and enable basic built-in validation by the browser.

Always use `type="email"` for email addresses and `type="tel"` for phone numbers. Use the `inputmode` attribute where necessary: `inputmode="numeric"` is ideal for PIN numbers.

Every `<input>`, `<select>`, and `<textarea>` element SHOULD have an appropriate `autocomplete` attribute, so that browsers and password managers can store and fill the data.

Username and email inputs hold identifiers, not prose. Add `spellcheck="false"` so the browser does not rewrite them into something the account does not match. `autocorrect` and `autocapitalize` are always disabled for `input type="email"`, but are required for non-email usernames.

### Make buttons helpful

Use `<button>` for buttons. You can also use `<input type="submit">`, but don't use a `div` or some other random element acting as a button. Button elements provide accessible behaviour, built-in form submission functionality, and can easily be styled.

Give each form submit button a value that says what it does. Use a clear, recognizable label. For example, use **Create account** or **Sign up** rather than **Continue** or **Submit**.

### Use a single name input where possible

Allow your users to enter their name using a single input, unless you have a good reason for separately storing given names, family names, honorifics, or other name parts. Using a single name input makes forms less complex, enables cut-and-paste, and makes autofill simpler.

Allow international names. For validation, avoid using regular expressions that only match Latin characters. Latin-only excludes users with names or addresses that include characters that aren't in the Latin alphabet. Allow Unicode letter matching instead—and ensure your backend supports Unicode securely as both input and output. Unicode in regular expressions is well supported by modern browsers.

### Show sign-up progress

For each step towards sign-up, use page headings and descriptive button values that make it clear what needs to be done now, and what the next step is.

Use the `enterkeyhint` attribute on form inputs to set the mobile keyboard enter key label. For example, use `enterkeyhint="previous"` and `enterkeyhint="next"` within a multi-page form, `enterkeyhint="done"` for the final input in the form, and `enterkeyhint="search"` for a search input.

### Validate carefully

Validate data entry both in realtime and before form submission. Use `type="email"` for email inputs — the browser will validate the format automatically. Add the `required` attribute to both the email and password fields; browsers then prompt and set focus for missing data.

For passwords, enforce only a minimum length with `minlength`, and don't set a `maxlength` below 64. NIST SP 800-63B requires at least 15 characters for a password used on its own and at least 8 when it is one factor of multi-factor authentication. Do not use `pattern` or script to require mixtures of character types: NIST says verifiers SHALL NOT impose composition rules, and such rules reject strong passphrases and browser-generated passwords. Check new passwords against a list of known-compromised passwords on the server instead.

### Put sign-up in its own `<form>` element

Always use the `<form>` element when you're getting users to enter data

Don't wrap inputs in a `<div>` and handle input data submission purely with JavaScript. It's generally better to use a `<form>` element. This makes your site accessible to screenreaders and other assistive devices, enables a range of built-in browser features, makes it simpler to build basic functional sign-up for older browsers, and can still work even if JavaScript fails.

### Don't double up inputs

Some sites force users to enter emails or passwords twice. That might reduce errors for a few users, but causes extra work for all users, and increases abandonment rates. Asking twice also makes no sense where browsers autofill email addresses or suggest strong passwords. It's better to enable users to confirm their email address (you'll need to do that anyway) and make it easy for them to reset their password if necessary.

### Keep passwords private—but enable users to see them if they want

Passwords inputs should have `type="password"` to hide password text and help the browser understand that the input is for passwords. (Note that browsers use a variety of techniques to understand input roles and decide whether or not to offer to save passwords.)

You should add a **Show password** toggle to enable users to check the text they've entered.

### Prevent mobile keyboard from obstructing the Sign up button

If you're not careful, mobile keyboards may cover your form or, worse, partially obstruct the Sign up button. Users may give up before realizing what has happened.

Where possible, avoid this by displaying only the email (or phone) and password inputs and Sign up button at the top of your sign-up page. Put other content underneath.

### Help users avoid re-entering sign-up data

Browsers and password managers store and fill credentials based on the input's `autocomplete` value, `type`, and its `<form>`. To allow credentials to be stored, give inputs a stable `name` or `id` (not randomly generated on each page load or site deployment), and put them in a `<form>` element with a submit button.

For email inputs use `autocomplete="username"`, since `username` is recognized by password managers—even though you should use `type="email"` and you may want to use `id="email"` and `name="email"`. For the password input, use `autocomplete="new-password"` so the browser offers a new password instead of filling a stored one.

### Use autocomplete="new-password" and id="new-password" for a new password

MANDATORY: For a sign-up form, use `autocomplete="new-password"`.

```html
<!-- new-password prevents password managers from auto-filling an existing password into this field -->
<input type="password" id="new-password" name="new-password" autocomplete="new-password" required>
```

### Enable the browser to suggest a strong password

Modern browsers use heuristics to decide when to show the password manager UI and suggest a strong password.

Built-in browser password generators mean users and developers don't need to work out what a "strong password" is. Since browsers can securely store passwords and autofill them as necessary, there's no need for users to remember or enter passwords. Encouraging users to take advantage of built-in browser password generators also means they're more likely to use a unique, strong password on your site, and less likely to reuse a password that could be compromised elsewhere.

### Allow password pasting

Don't block pasting into password inputs. Blocking paste stops users from pasting from a password manager, which encourages weaker, memorable passwords; NIST SP 800-63B says verifiers SHALL allow password managers and autofill, and SHOULD permit paste.

### Optionally offer third-party login

If your product already supports a third-party identity provider (federated login), you can offer it alongside the email and password form. Users who sign up this way don't need a password, and the provider may supply a verified email address. Federated login is optional; don't add it just to build a sign-up form.

### Take care with usernames

Don't insist on a username unless (or until) you need one. Enable users to sign up and sign in with only an email address (or telephone number) and password—or federated login if they prefer. Don't force them to choose and remember a username.

If your site does require usernames, don't impose unreasonable rules on them, and don't stop users from updating their username. On your backend you should generate a unique ID for every user account, not an identifier based on personal data such as username.

Also make sure to use `autocomplete="username"` for usernames.

### Fallback strategies

{{ BASELINE_STATUS("input-email-tel-url") }}
{{ BASELINE_STATUS("inputmode") }}
{{ BASELINE_STATUS("autocorrect") }}

Autofill is a progressive enhancement. In browsers that do not support autofill, users will simply need to manually enter their sign-up credentials. The semantic HTML constraints (such as `type`, `inputmode`, and `required`) will still function appropriately to validate user input and provide the correct virtual keyboards.

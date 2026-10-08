---
name: autofill-sign-in-form
description: Build a sign-in form with correct autocomplete values and autofill support.
web-feature-ids:
  - autocorrect
  - input-email-tel-url
  - inputmode
---

# Build a sign-in form that follows best practice

Use cross-platform browser features to build sign-in forms that are secure, accessible and easy to use.

If users ever need to sign in to your site, then good sign-in form design is critical. This is especially true for people on poor connections, on mobile, in a hurry, or under stress. Poorly designed sign-in forms get high bounce rates. Each bounce could mean a lost customer and a disgruntled user—not just a missed sign-in opportunity.

## How to implement

Outlined below are the most important guidelines for building successful sign-in forms.

### Use meaningful, valid HTML

Make the most of the elements and attributes built for creating forms:

- `<form>`, `<input>`, `<label>`, and `<button>`
- `type`, `autocomplete`, and `inputmode`

These enable built-in browser functionality, improve accessibility, and add meaning to markup.

### Use the `<label>` element to label form fields for data entry

To label an `<input>`, `<select>`, or `<textarea>`, use a `<label>`. Associate a label with an input by giving the label's `for` attribute the same value as the input's `id`.

### Make the most of HTML attributes

Make it easy for users to enter data, by using the appropriate `<input>` element `<type>` attribute to provide the right keyboard on mobile and enable basic built-in validation by the browser.

Always use `type="email"` for email addresses. If users sign in with a telephone number instead, use `type="tel"` for a telephone keypad. Use `inputmode="numeric"` for PINs.

Every `<input>` element SHOULD have an appropriate `autocomplete` attribute, so that browsers and password managers can store and fill the credentials.

Username and email inputs hold identifiers, not prose. Add `spellcheck="false"` so the browser does not rewrite them into something the account does not match. `autocorrect` and `autocapitalize` are always disabled for `input type="email"`, but are required for non-email usernames.

### Make buttons helpful

Use `<button>` for buttons. You can also use `<input type="submit">`, but don't use a `div` or some other random element acting as a button. Button elements provide accessible behaviour, built-in form submission functionality, and can easily be styled.

Give each form submit button a value that says what it does. Use a clear, recognizable label. For example, use **Sign In** rather than **Continue** or **Submit**.

### Show sign-in progress

For each step towards sign-in, use page headings and descriptive button values that make it clear what needs to be done now, and what the next step is.

Use the `enterkeyhint` attribute on form inputs to set the mobile keyboard enter key label. For example, use `enterkeyhint="next"` on the email input of an email-first flow and `enterkeyhint="done"` on the final input in the form.

### Put sign-in in its own `<form>` element

Always use the `<form>` element when you're getting users to enter data

Don't wrap inputs in a `<div>` and handle input data submission purely with JavaScript. It's generally better to use a `<form>` element. This makes your site accessible to screenreaders and other assistive devices, enables a range of built-in browser features, makes it simpler to build basic functional sign-in for older browsers, and can still work even if JavaScript fails.

### Don't double up inputs

Some sites force users to enter emails or passwords twice. That might reduce errors for a few users, but causes extra work for all users, and increases abandonment rates. Asking twice also makes no sense where browsers autofill email addresses or suggest strong passwords. It's better to enable users to confirm their email address (you'll need to do that anyway) and make it easy for them to reset their password if necessary.

### Keep passwords private—but enable users to see them if they want

Passwords inputs should have `type="password"` to hide password text and help the browser understand that the input is for passwords. (Note that browsers use a variety of techniques to understand input roles and decide whether or not to offer to save passwords.)

You should add a **Show password** toggle to enable users to check the text they've entered—and don't forget to add a **Forgot password** link.

### Prevent mobile keyboard from obstructing the Sign in button

If you're not careful, mobile keyboards may cover your form or, worse, partially obstruct the Sign in button. Users may give up before realizing what has happened.

Where possible, avoid this by displaying only the email (or phone) and password inputs and Sign in button at the top of your sign-in page. Put other content underneath.

### Help users avoid re-entering sign-in data

Browsers and password managers store and fill credentials based on the input's `autocomplete` value, `type`, and its `<form>`:

1.  To allow credentials to be stored, give inputs a stable `name` or `id` (not randomly generated on each page load or site deployment), and put them in a `<form>` element with a submit button.
1.  For the email input, use `autocomplete="username"`, since password managers recognize `username`—even though the input has `type="email"`, and you may use `id="email"` and `name="email"`.

### Use autocomplete="current-password" for an existing password

MANDATORY: Use `autocomplete="current-password"` for the password input in a sign-in form. This tells the browser to fill the current password it has stored for the site, rather than suggest a new one. The `autocomplete` value drives this, not the `id`: choose any stable `id` and `name`, such as `current-password` or `password`.

### Help save users from accidentally missing inputs

MANDATORY: Add the `required` attribute to both email and password fields. Modern browsers automatically prompt and set focus for missing data. `type="email"` also validates the email format without JavaScript.

```html
<input type="email" id="email" name="email" autocomplete="username" spellcheck="false" required>
<input type="password" id="current-password" name="current-password" autocomplete="current-password" required>
```

### Allow password pasting

Don't block pasting into password inputs. Blocking paste stops users from pasting from a password manager, which encourages weaker, memorable passwords; NIST SP 800-63B says verifiers SHOULD permit paste.

### Fallback strategies

{{ BASELINE_STATUS("input-email-tel-url") }}
{{ BASELINE_STATUS("inputmode") }}
{{ BASELINE_STATUS("autocorrect") }}

Autofill is a progressive enhancement. In browsers that do not support autofill, users will simply need to manually enter their sign-in credentials. The semantic HTML constraints (such as `type`, `inputmode`, and `required`) will still function appropriately to validate user input and provide the correct virtual keyboards.

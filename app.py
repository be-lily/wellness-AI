from flask import Flask, render_template

app = Flask(__name__)

# This route serves the main HTML page
@app.route('/')
def home():
    return render_template('index.html')

if __name__ == '__main__':
    # debug=True reloads the server automatically on code changes
    app.run(debug=True)
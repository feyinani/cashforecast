from flask import Flask, render_template, jsonify, request
import pandas as pd
from datetime import datetime

app = Flask(__name__)


def remove_duplicate_entries(df, column_list):
    last_seen = {col: None for col in column_list}
    for idx, row in df.iterrows():
        for col in column_list:
            if row[col] == last_seen[col]:
                df.at[idx, col] = ""
            else:
                last_seen[col] = row[col]
    return df


@app.route('/')
@app.route('/cashforecast')
def cashforecast():
    return render_template('cashforecast.html')


@app.route('/get-data-CF')
def get_data_CF():
    try:
        correct_order = ['Cash Flow Main 4', 'Cash Flow Main 3',
                         'Cash Flow Main 2', 'Cash Flow Main 1', 'Cash Flow Category']
        include_currency = request.args.get(
            'include_currency', 'false').lower() == 'true'
        if include_currency:
            correct_order.insert(0, 'transaction_currency_code')

        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        cashforce_df = pd.read_csv('static/excel/Modified_Cash_Pool_Data.csv')
        bank_balance_df = pd.read_csv(
            'static/excel/Modified_Bank_Balances_Data.csv')

        cashforce_df['transaction_dt'] = pd.to_datetime(
            cashforce_df['transaction_dt'])
        if start_date and end_date:
            cashforce_df = cashforce_df[(cashforce_df['transaction_dt'] >= start_date) & (
                cashforce_df['transaction_dt'] <= end_date)]
        else:
            current_month_start = datetime.now().replace(day=1)
            current_month_end = (
                current_month_start + pd.DateOffset(months=1)) - pd.DateOffset(days=1)
            cashforce_df = cashforce_df[(cashforce_df['transaction_dt'] >= current_month_start) & (
                cashforce_df['transaction_dt'] <= current_month_end)]

        grouped_df = cashforce_df.groupby(
            correct_order + ['transaction_dt']).agg({'transaction_amount': 'sum'}).reset_index()
        pivot_df = grouped_df.pivot_table(
            index=correct_order, columns='transaction_dt', values='transaction_amount', aggfunc='sum', fill_value=0)
        pivot_df.columns = [col.strftime(
            '%Y-%m-%d') if isinstance(col, pd.Timestamp) else col for col in pivot_df.columns]
        pivot_df.reset_index(inplace=True)

        combined_rows = []
        for currency in bank_balance_df['transaction_currency_code'].unique() if include_currency else ['GBP']:
            opening_balance_row = {col: '' for col in pivot_df.columns}
            closing_balance_row = {col: '' for col in pivot_df.columns}
            if include_currency:
                opening_balance_row['transaction_currency_code'] = currency
                closing_balance_row['transaction_currency_code'] = currency
            opening_balance_row['Cash Flow Main 4'] = 'Opening Balance'
            closing_balance_row['Cash Flow Main 4'] = 'Closing Balance'
            opening_balance = bank_balance_df.loc[bank_balance_df['transaction_currency_code'] == currency, 'balance'].sum(
            ) if include_currency else 0
            closing_balance = opening_balance
            for date_col in pivot_df.columns:
                if date_col not in correct_order:
                    opening_balance_row[date_col] = f"{opening_balance:.2f}"
                    closing_balance_row[date_col] = f"{closing_balance:.2f}"
            combined_rows.append(pd.DataFrame([opening_balance_row]))
            combined_rows.append(
                pivot_df[pivot_df['transaction_currency_code'] == currency] if include_currency else pivot_df)
            combined_rows.append(pd.DataFrame([closing_balance_row]))

        combined_df = pd.concat(combined_rows, ignore_index=True)
        combined_df = remove_duplicate_entries(combined_df, correct_order)

        numeric_columns = combined_df.select_dtypes(include=['number']).columns
        for col in numeric_columns:
            combined_df[col] = combined_df[col].apply(lambda x: f"{x:.2f}")

        json_data_CF = combined_df.to_json(orient='records', date_format='iso')
        print(json_data_CF)

        return jsonify(json_data_CF=json_data_CF)
    except Exception as e:
        return jsonify(error=str(e)), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
